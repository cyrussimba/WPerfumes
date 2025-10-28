/**
 * static/js/announcements.js
 *
 * Robust announcements scroller that now:
 * - Uses CSS per-item animation (vertical-marquee) for the visual movement.
 * - JS scroller will NOT fight CSS animation. If CSS per-item animation is active the JS
 *   scroller will avoid applying transforms and will only provide pause/resume controls
 *   (for focus/hover/visibility/mutation lifecycle).
 *
 * This makes individual items animate on mobile just like on large screens,
 * while preserving the robust lifecycle (pause on focus/visibility) and dynamic updates.
 */
(function () {
    'use strict';

    const DEFAULT_DELAY = 3000;

    function debounce(fn, wait) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function Scroller(listEl) {
        this.listEl = listEl;
        this.items = Array.from(listEl.children).filter(n => n.nodeType === 1);
        this.currentIndex = 0;
        this.intervalId = null;
        this.paused = false;
        this.itemHeight = 0;
        this.delay = parseInt(listEl.getAttribute('data-delay'), 10) || DEFAULT_DELAY;
        this.visible = true;
        this.mutationObserver = null;
        this.intersectionObserver = null;

        // If CSS per-item animation (vertical-marquee) is active we switch to "cssMode"
        // where JS avoids translating the whole list and only controls pause/resume.
        this.cssMode = false;

        // Keep references to handlers so we can unbind
        this._mouseenterHandler = null;
        this._mouseleaveHandler = null;
        this._onResize = null;
        this._onVisibilityChange = null;

        this.init();
    }

    Scroller.prototype._detectCssAnimation = function () {
        // If there are no items, default to non-css mode
        if (!this.items || !this.items.length) return false;
        try {
            const cs = window.getComputedStyle(this.items[0]);
            const animName = (cs && (cs.getPropertyValue('animation-name') || cs.animationName)) || 'none';
            const animDur = (cs && (cs.getPropertyValue('animation-duration') || cs.animationDuration)) || '0s';
            // If animation-name isn't 'none' and duration > 0, assume CSS per-item animation is active
            return animName !== 'none' && !animDur.startsWith('0');
        } catch (e) {
            return false;
        }
    };

    Scroller.prototype.init = function () {
        this.items = Array.from(this.listEl.children).filter(n => n.nodeType === 1);

        if (!this.listEl || this.items.length < 1) {
            this.listEl.style.transition = '';
            this.listEl.style.transform = '';
            return;
        }

        // Decide if CSS per-item animation (vertical-marquee) is active
        this.cssMode = this._detectCssAnimation();

        // Set JS-list transition (harmless when not used)
        this.listEl.style.transition = this.listEl.style.transition || 'transform 0.45s cubic-bezier(.2,.9,.2,1)';

        // Compute initial item height for JS-based movement (if not using CSS per-item)
        this.computeItemHeight();

        // Delay start slightly to allow layout & CSS animation to stabilize
        setTimeout(() => {
            this.start();
        }, 120);

        // Attach event handlers (we use them for both cssMode and js-mode)
        this._mouseenterHandler = () => this.pause('hover');
        this._mouseleaveHandler = () => this.resume('hover');
        this.listEl.addEventListener('mouseenter', this._mouseenterHandler);
        this.listEl.addEventListener('mouseleave', this._mouseleaveHandler);

        // Keyboard accessibility handlers on each item (pause when focused)
        this.items.forEach((it) => {
            if (!it.hasAttribute('tabindex')) it.setAttribute('tabindex', '0');
            const focusHandler = () => this.pause('focus');
            const blurHandler = () => this.resume('focus');
            it.__announcement_focus_handler = focusHandler;
            it.__announcement_blur_handler = blurHandler;
            it.addEventListener('focus', focusHandler);
            it.addEventListener('blur', blurHandler);
        });

        // Resize handling
        this._onResize = debounce(() => {
            this.computeItemHeight();
            // For js-mode apply transform to keep position correct
            if (!this.cssMode) this.applyTransform();
        }, 120);
        window.addEventListener('resize', this._onResize);

        // Support dynamic changes: observe childList and rebind handlers when items change
        if ('MutationObserver' in window) {
            this.mutationObserver = new MutationObserver((mutations) => {
                setTimeout(() => {
                    // remove previous per-item handlers
                    this.items.forEach(it => {
                        try {
                            if (it.__announcement_focus_handler) it.removeEventListener('focus', it.__announcement_focus_handler);
                            if (it.__announcement_blur_handler) it.removeEventListener('blur', it.__announcement_blur_handler);
                        } catch (e) { /* ignore */ }
                        delete it.__announcement_focus_handler;
                        delete it.__announcement_blur_handler;
                    });

                    // refresh items list
                    this.items = Array.from(this.listEl.children).filter(n => n.nodeType === 1);

                    // re-detect cssMode (in case CSS changed or new items inserted)
                    this.cssMode = this._detectCssAnimation();

                    // attach new handlers
                    this.items.forEach((it) => {
                        if (!it.hasAttribute('tabindex')) it.setAttribute('tabindex', '0');
                        const focusHandler = () => this.pause('focus');
                        const blurHandler = () => this.resume('focus');
                        it.__announcement_focus_handler = focusHandler;
                        it.__announcement_blur_handler = blurHandler;
                        it.addEventListener('focus', focusHandler);
                        it.addEventListener('blur', blurHandler);
                    });

                    this.computeItemHeight();
                    if (this.currentIndex >= this.items.length) this.currentIndex = 0;
                    if (!this.cssMode) this.applyTransform();
                    if (!this.paused) this.restartInterval();
                }, 80);
            });
            this.mutationObserver.observe(this.listEl, { childList: true, subtree: false });
        }

        // IntersectionObserver to pause when offscreen
        if ('IntersectionObserver' in window) {
            this.intersectionObserver = new IntersectionObserver(entries => {
                entries.forEach(ent => {
                    this.visible = ent.isIntersecting;
                    if (!this.visible) this.pause('offscreen');
                    else this.resume('offscreen');
                });
            }, { threshold: 0.01 });
            this.intersectionObserver.observe(this.listEl);
        }

        // Page visibility handling
        this._onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') this.pause('hidden');
            else this.resume('hidden');
        };
        document.addEventListener('visibilitychange', this._onVisibilityChange);
    };

    Scroller.prototype.computeItemHeight = function () {
        if (this.items && this.items.length) {
            const r = this.items[0].getBoundingClientRect();
            this.itemHeight = Math.max(1, Math.round(r.height));
        } else {
            this.itemHeight = 30;
        }
    };

    Scroller.prototype.start = function () {
        if (this.intervalId) return;
        if (!this.items || this.items.length < 2) return;
        // If user prefers reduced motion, do not start any auto rotation.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        // If CSS per-item animation is active, we don't need to translate the list;
        // CSS handles the visual changes. JS will instead provide pause/resume only.
        if (this.cssMode) {
            // nothing to start (CSS runs automatically)
            return;
        }

        // JS-driven auto-rotation for the whole list (fallback when CSS animation is not used)
        this.intervalId = setInterval(() => this.showNext(), this.delay);
    };

    Scroller.prototype.restartInterval = function () {
        this.stop();
        if (!this.paused && this.visible) this.start();
    };

    Scroller.prototype.stop = function () {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    };

    Scroller.prototype.pause = function (reason = '') {
        this.paused = true;
        // Stop JS interval if running
        this.stop();

        // If CSS per-item animation is active, pause CSS animations by toggling animation-play-state
        if (this.cssMode && this.items && this.items.length) {
            this.items.forEach(it => {
                try { it.style.animationPlayState = 'paused'; } catch (e) { /* ignore */ }
            });
        } else {
            // For JS mode, nothing else to do (we already stopped interval). But for accessibility
            // we may want to visually freeze the list in place: keep current transform.
        }
    };

    Scroller.prototype.resume = function (reason = '') {
        this.paused = false;

        // Resume CSS animations if in cssMode
        if (this.cssMode && this.items && this.items.length) {
            this.items.forEach(it => {
                try { it.style.animationPlayState = 'running'; } catch (e) { /* ignore */ }
            });
        }

        if (this.visible) this.restartInterval();
    };

    Scroller.prototype.showNext = function () {
        if (!this.items || this.items.length < 2) return;
        this.currentIndex = (this.currentIndex + 1) % this.items.length;
        this.applyTransform();
    };

    Scroller.prototype.applyTransform = function () {
        if (!this.itemHeight) this.computeItemHeight();
        const translateY = -this.currentIndex * this.itemHeight;
        this.listEl.style.transform = `translateY(${translateY}px)`;
    };

    Scroller.prototype.destroy = function () {
        this.stop();
        try {
            if (this._onResize) window.removeEventListener('resize', this._onResize);
            if (this._onVisibilityChange) document.removeEventListener('visibilitychange', this._onVisibilityChange);
            if (this.mutationObserver) this.mutationObserver.disconnect();
            if (this.intersectionObserver) this.intersectionObserver.disconnect();

            if (this._mouseenterHandler) this.listEl.removeEventListener('mouseenter', this._mouseenterHandler);
            if (this._mouseleaveHandler) this.listEl.removeEventListener('mouseleave', this._mouseleaveHandler);

            // remove per-item handlers using stored references
            this.items.forEach((it) => {
                try {
                    if (it.__announcement_focus_handler) it.removeEventListener('focus', it.__announcement_focus_handler);
                    if (it.__announcement_blur_handler) it.removeEventListener('blur', it.__announcement_blur_handler);
                } catch (e) { /* ignore */ }
                delete it.__announcement_focus_handler;
                delete it.__announcement_blur_handler;
            });

            // clear any inline animationPlayState set by pause
            if (this.items && this.items.length) {
                this.items.forEach(it => { try { it.style.animationPlayState = ''; } catch (e) { /* ignore */ } });
            }
        } catch (e) {
            // ignore removal errors
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const lists = Array.from(document.querySelectorAll('.announcement-list'));
        if (!lists.length) return;

        const scrollers = lists.map(list => new Scroller(list));
        try {
            Object.defineProperty(window, '__announcementScollers', {
                value: scrollers,
                writable: false,
                configurable: true,
                enumerable: false
            });
        } catch (e) { /* non-critical */ }

        window.addEventListener('beforeunload', () => {
            scrollers.forEach(s => s.destroy && s.destroy());
        });
    });
})();