/**
 * static/js/announcements.js
 *
 * Robust announcements scroller (fixed destroy/unbind handlers bug).
 * - When adding focus/blur/mouse handlers we store references so we can remove them on destroy.
 * - Minor defensive checks added.
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

        // Handlers we will attach (so we can remove them later)
        this._mouseenterHandler = null;
        this._mouseleaveHandler = null;
        this._onResize = null;
        this._onVisibilityChange = null;

        this.init();
    }

    Scroller.prototype.init = function () {
        this.items = Array.from(this.listEl.children).filter(n => n.nodeType === 1);

        if (!this.listEl || this.items.length < 2) {
            this.listEl.style.transition = '';
            this.listEl.style.transform = '';
            return;
        }

        this.listEl.style.transition = this.listEl.style.transition || 'transform 0.45s cubic-bezier(.2,.9,.2,1)';

        this.computeItemHeight();

        setTimeout(() => {
            this.start();
        }, 120);

        // Store handlers to allow proper removal later
        this._mouseenterHandler = () => this.pause('hover');
        this._mouseleaveHandler = () => this.resume('hover');
        this.listEl.addEventListener('mouseenter', this._mouseenterHandler);
        this.listEl.addEventListener('mouseleave', this._mouseleaveHandler);

        // Keyboard accessibility: attach named handlers and save them on elements
        this.items.forEach((it) => {
            if (!it.hasAttribute('tabindex')) it.setAttribute('tabindex', '0');
            // create handlers and attach to the element so we can remove them later
            const focusHandler = () => this.pause('focus');
            const blurHandler = () => this.resume('focus');
            it.__announcement_focus_handler = focusHandler;
            it.__announcement_blur_handler = blurHandler;
            it.addEventListener('focus', focusHandler);
            it.addEventListener('blur', blurHandler);
        });

        this._onResize = debounce(() => {
            this.computeItemHeight();
            this.applyTransform();
        }, 120);
        window.addEventListener('resize', this._onResize);

        if ('MutationObserver' in window) {
            this.mutationObserver = new MutationObserver((mutations) => {
                setTimeout(() => {
                    // Before reattaching, remove any previously attached per-item handlers
                    this.items.forEach(it => {
                        try {
                            if (it.__announcement_focus_handler) it.removeEventListener('focus', it.__announcement_focus_handler);
                            if (it.__announcement_blur_handler) it.removeEventListener('blur', it.__announcement_blur_handler);
                        } catch (e) { /* ignore */ }
                        delete it.__announcement_focus_handler;
                        delete it.__announcement_blur_handler;
                    });

                    this.items = Array.from(this.listEl.children).filter(n => n.nodeType === 1);
                    // reattach new handlers
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
                    this.applyTransform();
                    if (!this.paused) this.restartInterval();
                }, 80);
            });
            this.mutationObserver.observe(this.listEl, { childList: true, subtree: false });
        }

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
            this.itemHeight = 22;
        }
    };

    Scroller.prototype.start = function () {
        if (this.intervalId) return;
        if (this.items.length < 2) return;
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
        this.stop();
    };

    Scroller.prototype.resume = function (reason = '') {
        this.paused = false;
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