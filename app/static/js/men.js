// app/static/js/men.js
// Complete, defensive Men page script (full).
// - Ensures Top Picks render a visible product name directly under the product image.
// - Robust product resolution (id, _id, product_id, title matching).
// - Defensive network handling, logging, and small debug API.
// - Designed to run only on /men and /women pages (guarded).
//
// Notes:
// - This script expects main.js (shared cart/checkout functions like addToCart) to be loaded first.
// - Styling for the name is applied inline to guarantee visibility; you can move this to CSS later if desired.

(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------------
    const API = "/api";
    const BRANDSPERPAGE = 5;
    const AUTO_SLIDE_DURATION = 4000;
    const PLACEHOLDER_IMG = (typeof window !== 'undefined' && window.PLACEHOLDER_IMG) ? window.PLACEHOLDER_IMG : '/static/images/placeholder.jpg';
    const DEFAULT_PRODUCT_IMG = (typeof window !== 'undefined' && window.DEFAULT_PRODUCT_IMG) ? window.DEFAULT_PRODUCT_IMG : '/static/images/default.jpg';
    const LOG_PREFIX = 'men.js:';

    // -----------------------------------------------------------------------
    // Internal state
    // -----------------------------------------------------------------------
    let ALL_BRANDS = [];
    let currentBrands = [];
    let currentPage = 1;
    let autoSlideInterval = null;

    // Page guard: only run heavy init on /men or /women
    const _PATHNAME = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
    const IS_MEN_OR_WOMEN_PAGE = _PATHNAME.startsWith('/men') || _PATHNAME.startsWith('/women');

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    function log(...args) { try { console.debug(LOG_PREFIX, ...args); } catch (e) { /* ignore */ } }
    function warn(...args) { try { console.warn(LOG_PREFIX, ...args); } catch (e) { /* ignore */ } }
    function error(...args) { try { console.error(LOG_PREFIX, ...args); } catch (e) { /* ignore */ } }

    function isString(x) { return typeof x === 'string' || x instanceof String; }
    function toStaticUrl(url) {
        if (!url) return PLACEHOLDER_IMG;
        if (!isString(url)) return PLACEHOLDER_IMG;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return url;
        return `/static/${url}`;
    }

    function escapeHtmlAttr(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeText(s) {
        if (s === null || s === undefined) return '';
        return String(s);
    }

    async function safeFetch(url, opts = {}) {
        try {
            const res = await fetch(url, Object.assign({ credentials: 'include' }, opts));
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            return res;
        } catch (e) {
            warn('safeFetch error', url, e);
            throw e;
        }
    }

    async function safeFetchJson(url, opts = {}) {
        const res = await safeFetch(url, opts);
        try { return await res.json(); } catch (e) { warn('parse json failed', url, e); return null; }
    }

    // -----------------------------------------------------------------------
    // Discount display (small copy from main.js to keep UX consistent)
    // -----------------------------------------------------------------------
    async function fetchDiscountPercent() {
        try {
            const r = await fetch(`${API}/settings/checkout_discount`);
            if (!r.ok) throw new Error('no-discount');
            const js = await r.json().catch(() => ({}));
            const percent = parseFloat(js.percent) || 0;
            const discountInfoDiv = document.getElementById('discountPercentInfo');
            if (discountInfoDiv) {
                if (percent > 0) {
                    discountInfoDiv.style.display = "block";
                    discountInfoDiv.innerHTML = `<span>🌟 <b>Special Offer:</b> <span style="color:#27ae60">${percent}% OFF</span> applied automatically at checkout & in your cart!</span>`;
                } else {
                    discountInfoDiv.style.display = "none";
                    discountInfoDiv.innerHTML = '';
                }
            }
            log('checkout discount percent', percent);
        } catch (err) {
            warn('fetchDiscountPercent error', err);
            const discountInfoDiv = document.getElementById('discountPercentInfo');
            if (discountInfoDiv) discountInfoDiv.style.display = "none";
        }
    }

    // -----------------------------------------------------------------------
    // Brands list (paginated) + auto-pagination controls
    // -----------------------------------------------------------------------
    function displayBrands(brands = [], page = 1) {
        const brandList = document.getElementById('brandList');
        if (!brandList) { warn('#brandList not found'); return; }
        brandList.style.opacity = 0;
        setTimeout(() => {
            brandList.innerHTML = '';
            const start = (page - 1) * BRANDSPERPAGE;
            const items = (brands || []).slice(start, start + BRANDSPERPAGE);
            if (!items.length) {
                brandList.innerHTML = `<li style="color:#888;padding:12px;">No brands found.</li>`;
                brandList.style.opacity = 1;
                return;
            }
            for (const b of items) {
                const brandName = b.name || 'Unknown Brand';
                const li = document.createElement('li');
                li.innerHTML = `
          <div class="product-image-container">
            <img src="${toStaticUrl(b.logo)}" alt="${escapeHtmlAttr(brandName)}" class="product-image">
          </div>
          <div class="product-name" title="${escapeHtmlAttr(brandName)}">${escapeText(brandName)}</div>
        `;
                li.setAttribute('data-brand', (b.name || '').replace(/ /g, '_'));
                li.addEventListener('click', () => {
                    window.location.href = `/brand?brand=${encodeURIComponent(brandName)}`;
                });
                brandList.appendChild(li);
            }
            brandList.style.opacity = 1;
            log('displayBrands', 'page', page, 'shown', items.length);
        }, 120);
    }

    function setupPagination(brands = []) {
        const controls = document.getElementById('paginationControls');
        const toggleBtn = document.getElementById('autoSlideToggle');
        if (!controls || !toggleBtn) { warn('pagination controls or toggle missing'); return; }

        // preserve toggle
        const preserved = toggleBtn.cloneNode(true);
        controls.innerHTML = '';
        controls.appendChild(preserved);

        const pageCount = Math.max(1, Math.ceil((brands || []).length / BRANDSPERPAGE));
        for (let i = 1; i <= pageCount; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = i;
            btn.setAttribute('data-page', i);
            if (i === currentPage) btn.classList.add('active');
            btn.addEventListener('click', (e) => {
                stopAutoPagination();
                currentPage = parseInt(e.target.dataset.page, 10) || 1;
                displayBrands(currentBrands, currentPage);
                setupPagination(currentBrands);
                const container = document.getElementById('brandListContainer');
                if (container) window.scrollTo({ top: container.offsetTop, behavior: 'smooth' });
            });
            controls.insertBefore(btn, preserved);
        }

        preserved.addEventListener('click', handleAutoSlideToggle);
    }

    function autoPaginate() {
        const totalPages = Math.max(1, Math.ceil((currentBrands || []).length / BRANDSPERPAGE));
        currentPage++;
        if (currentPage > totalPages) currentPage = 1;
        displayBrands(currentBrands, currentPage);
        setupPagination(currentBrands);
    }

    function startAutoPagination() {
        if (autoSlideInterval === null && currentBrands.length > BRANDSPERPAGE) {
            autoSlideInterval = setInterval(autoPaginate, AUTO_SLIDE_DURATION);
            const btn = document.getElementById('autoSlideToggle');
            if (btn) { btn.textContent = "⏸️ Stop Auto-Slide"; btn.classList.add('active'); }
            log('auto pagination started');
        }
    }

    function stopAutoPagination() {
        if (autoSlideInterval !== null) {
            clearInterval(autoSlideInterval);
            autoSlideInterval = null;
            const btn = document.getElementById('autoSlideToggle');
            if (btn) { btn.textContent = "▶️ Start Auto-Slide"; btn.classList.remove('active'); }
            log('auto pagination stopped');
        }
    }

    function handleAutoSlideToggle() {
        if (autoSlideInterval === null) startAutoPagination();
        else stopAutoPagination();
    }

    // -----------------------------------------------------------------------
    // Load dynamic Top Picks by Lifestyle
    // - New rule: Product name must appear immediately below the image.
    // - We insert a dedicated .dynamic-top-pick-name element right after the image wrapper
    //   and set its textContent (not innerHTML) to avoid HTML injection and ensure visibility.
    // -----------------------------------------------------------------------
    async function loadDynamicTopPicksByLifestyle() {
        try {
            // fetch top picks and products in parallel
            const [tpRes, prodRes] = await Promise.all([fetch(`${API}/top-picks`), fetch(`${API}/products`)]);
            if (!tpRes.ok) throw new Error(`top-picks fetch failed (${tpRes.status})`);
            const topPicks = await tpRes.json();
            const products = prodRes.ok ? await prodRes.json() : [];

            // Build product map (support id, _id, product_id)
            const prodMap = {};
            if (Array.isArray(products)) {
                products.forEach(p => {
                    if (!p) return;
                    const addKey = k => { if (k) prodMap[String(k)] = p; };
                    addKey(p.id); addKey(p._id); addKey(p.product_id);
                });
            }

            const picks = Array.isArray(topPicks) ? topPicks.filter(tp => tp.pushed) : [];
            const container = document.getElementById('dynamicTopPicksByLifestyleContainer');
            if (!container) { warn('dynamicTopPicks container missing'); return; }

            // Clear existing content
            container.innerHTML = '';

            // If none, show men/women-only fallback message
            if (!picks || picks.length === 0) {
                try {
                    const path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
                    const isMenOrWomenPage = path.startsWith('/men') || path.startsWith('/women');
                    if (isMenOrWomenPage) {
                        container.innerHTML = "<div style='color:#888;font-size:1.05em'>No Top Picks by Lifestyle available. Check back soon!</div>";
                    } else {
                        container.innerHTML = "";
                    }
                } catch (e) {
                    container.innerHTML = "";
                }
                return;
            }

            // Render picks
            for (const tp of picks) {
                // Resolve product
                let prod = null;
                try {
                    if (tp && tp.product_id) {
                        prod = prodMap[String(tp.product_id)] || prodMap[tp.product_id] || null;
                    }
                    if (!prod && tp) {
                        const trial = ['id', '_id', 'product_id'];
                        for (const k of trial) {
                            if (!prod && tp[k]) prod = prodMap[String(tp[k])] || null;
                        }
                    }
                    if (!prod && tp && tp.product_title && Array.isArray(products)) {
                        const tt = String(tp.product_title).toLowerCase().trim();
                        prod = products.find(p => {
                            const candidate = String(p.title || p.name || '').toLowerCase().trim();
                            return candidate && candidate === tt;
                        }) || null;
                    }
                } catch (e) {
                    warn('product resolution failure', tp, e);
                }

                // Determine image, title, brand, price, reviews
                const imgUrl = prod ? (prod.image_url ? toStaticUrl(prod.image_url) : (prod.image ? toStaticUrl(prod.image) : DEFAULT_PRODUCT_IMG)) : (tp.image_url ? toStaticUrl(tp.image_url) : DEFAULT_PRODUCT_IMG);
                const resolvedTitle = (prod && (prod.title || prod.name)) || tp.product_title || '';
                const resolvedBrand = (prod && (prod.brand || prod.manufacturer)) || tp.brand || '';
                const resolvedPrice = (prod && (typeof prod.price !== 'undefined' && prod.price !== null)) ? prod.price : (tp.price || '—');
                const resolvedReviews = (prod && (typeof prod.reviews_count !== 'undefined' && prod.reviews_count !== null)) ? prod.reviews_count : (tp.reviews_count || 0);

                // Create card DOM: image -> name (new rule) -> details -> actions
                const card = document.createElement('div');
                card.className = 'dynamic-top-pick-card';

                // Build markup: image wrapper then a dedicated name element (guarantee it's right below image)
                card.innerHTML = `
          <div class="image-wrapper" style="background:#fff;">
            <img src="${escapeHtmlAttr(imgUrl)}" alt="${escapeHtmlAttr(resolvedTitle || 'Product')}" />
          </div>
          <!-- Name element MUST appear right below the image per requested rule -->
          <div class="dynamic-top-pick-name" aria-hidden="false" role="heading" style="
              padding: 8px 12px 0 12px;
              font-weight:700;
              font-size:1.02em;
              color:#3e2723;
              text-align:left;
              overflow:hidden;
              text-overflow:ellipsis;
              white-space:nowrap;
          "></div>
          <div class="dynamic-top-pick-details" style="padding:6px 12px 10px 12px;">
            <div class="dynamic-top-pick-brand" style="font-size:0.95em;color:#2d8f7c;margin-top:6px;"></div>
            <div class="dynamic-top-pick-meta" style="display:flex;gap:8px;align-items:center;font-size:0.9em;color:#444;margin-top:6px;">
              <div class="dynamic-top-pick-sales" style="color:#c88c00;">Top Seller: ${tp.sales_count || 0} sold</div>
              <div aria-hidden="true">·</div>
              <div class="dynamic-top-pick-reviews">⭐ ${resolvedReviews} reviews</div>
            </div>
            <div class="dynamic-top-pick-tags" style="font-size:0.87em;color:#666;margin-top:6px;">Lifestyle: ${Array.isArray(tp.tags) ? tp.tags.join(', ') : (tp.tags || '')}</div>
            <div class="dynamic-top-pick-price" style="font-weight:700;color:#e53935;margin-top:6px;">${(resolvedPrice === '—') ? '' : 'AED ' + Number(resolvedPrice).toFixed(2)}</div>
          </div>
          <div class="dynamic-top-pick-actions" style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(0,0,0,0.03);background:#fafafa;">
            <button class="buy-now" style="background:#3e2723;color:#fff;border:none;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer;">Buy Now</button>
            <button class="wishlist-btn" style="background:transparent;border:1px solid #e0e0e0;padding:8px 10px;border-radius:6px;cursor:pointer;">♡ Wishlist</button>
          </div>
        `;

                // Append card
                container.appendChild(card);

                // Set the name textContent explicitly (avoid innerHTML usage for safety)
                try {
                    const nameEl = card.querySelector('.dynamic-top-pick-name');
                    if (nameEl) {
                        // If resolvedTitle is empty, fall back to product record fields
                        let nameToShow = resolvedTitle || (prod && (prod.title || prod.name)) || tp.product_title || '';
                        if (!nameToShow && prod && prod.brand && prod.sku) {
                            // last-resort fallback combine brand + sku
                            nameToShow = `${prod.brand} ${prod.sku}`;
                        }
                        if (!nameToShow) {
                            // Final fallback: a friendly placeholder
                            nameToShow = 'Product';
                            warn('Top Pick missing title', tp);
                        }
                        nameEl.textContent = nameToShow;
                        // Also add a title attribute for truncated names
                        nameEl.setAttribute('title', nameToShow);
                    }
                } catch (e) {
                    warn('failed to set top pick name', e);
                }

                // Set the brand
                try {
                    const brandEl = card.querySelector('.dynamic-top-pick-brand');
                    if (brandEl) brandEl.textContent = resolvedBrand || '';
                } catch (e) { /* ignore */ }

                // Attach actions
                try {
                    const productForCart = {
                        id: prod ? (prod.id || prod._id || prod.product_id) : (tp.product_id || resolvedTitle || 'product'),
                        title: resolvedTitle || tp.product_title || 'Product',
                        price: (prod && (prod.price || prod.price === 0)) ? Number(prod.price) : (tp.price ? Number(tp.price) : 0),
                        image_url: imgUrl
                    };
                    const productUrl = prod ? (`/product?id=${encodeURIComponent(prod.id || prod._id || prod.product_id)}`) : (`/product?title=${encodeURIComponent(resolvedTitle || tp.product_title || '')}`);

                    const buyBtn = card.querySelector('.buy-now');
                    if (buyBtn) {
                        buyBtn.addEventListener('click', (e) => {
                            try {
                                e.preventDefault(); e.stopPropagation();
                                if (typeof addToCart === 'function') {
                                    addToCart(productForCart);
                                } else {
                                    window.location.href = productUrl;
                                }
                            } catch (err) {
                                warn('buy handler error', err);
                                window.location.href = productUrl;
                            }
                        });
                    }

                    const wishBtn = card.querySelector('.wishlist-btn');
                    if (wishBtn) {
                        wishBtn.addEventListener('click', (e) => {
                            e.preventDefault(); e.stopPropagation();
                            wishBtn.textContent = '✓ Saved';
                            wishBtn.disabled = true;
                        });
                    }
                } catch (e) {
                    warn('failed to wire actions for top-pick', e);
                }
            } // end for each pick

            log('Top Picks rendered', picks.length);
        } catch (e) {
            error('loadDynamicTopPicksByLifestyle error', e);
            const container = document.getElementById('dynamicTopPicksByLifestyleContainer');
            if (container) container.innerHTML = "<div style='color:#c00'>Failed to load Top Picks.</div>";
        }
    }

    // -----------------------------------------------------------------------
    // Load brands (small helper)
    // -----------------------------------------------------------------------
    async function loadBrands() {
        try {
            const r = await fetch(`${API}/brands`);
            if (!r.ok) throw new Error(`brands fetch failed (${r.status})`);
            const brands = await r.json();
            ALL_BRANDS = Array.isArray(brands) ? brands : [];
            currentBrands = ALL_BRANDS.slice();
            currentPage = 1;
            displayBrands(currentBrands, currentPage);
            setupPagination(currentBrands);
            log('brands loaded', ALL_BRANDS.length);
        } catch (e) {
            warn('loadBrands error', e);
            const brandList = document.getElementById('brandList');
            if (brandList) brandList.innerHTML = "<li style='color:#888'>Failed to load brands. Try again later.</li>";
        }
    }

    // -----------------------------------------------------------------------
    // Filters wiring
    // -----------------------------------------------------------------------
    function wireFilters() {
        const genderFilter = document.getElementById('genderFilter');
        const brandFilter = document.getElementById('brandFilter');
        const brandStatus = document.getElementById('brandStatus');

        if (genderFilter) {
            genderFilter.addEventListener('change', () => {
                const selectedGender = genderFilter.value;
                const selectedText = genderFilter.options[genderFilter.selectedIndex] ? genderFilter.options[genderFilter.selectedIndex].text.trim() : selectedGender;
                if (brandStatus) brandStatus.textContent = `${selectedText} Products. Select a brand or use the filter above.`;
                if (brandFilter) {
                    brandFilter.disabled = false;
                    brandFilter.innerHTML = '<option value="" disabled selected>Select a Brand</option>';
                    (ALL_BRANDS || []).forEach(brandObj => {
                        const opt = document.createElement('option');
                        opt.value = (brandObj.name || '').replace(/ /g, '_');
                        opt.textContent = brandObj.name || '';
                        brandFilter.appendChild(opt);
                    });
                }
                currentBrands = ALL_BRANDS.slice();
                currentPage = 1;
                displayBrands(currentBrands, currentPage);
                setupPagination(currentBrands);
                if (autoSlideInterval !== null) {
                    stopAutoPagination();
                    startAutoPagination();
                }
            });
        }

        if (brandFilter) {
            brandFilter.addEventListener('change', () => {
                const selected = brandFilter.value;
                if (!selected) return;
                currentBrands = (ALL_BRANDS || []).filter(b => (b.name || '').replace(/ /g, '_') === selected);
                currentPage = 1;
                displayBrands(currentBrands, currentPage);
                setupPagination(currentBrands);
            });
        }
    }

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------
    function init() {
        log('init start');

        // Skip if not on men/women page
        if (!IS_MEN_OR_WOMEN_PAGE) {
            log('men.js: not a men/women page; skipping initialization to avoid injecting Top Picks on other pages.');
            return;
        }

        // Wire auto-slide toggle
        const autoSlideToggle = document.getElementById('autoSlideToggle');
        if (autoSlideToggle) autoSlideToggle.addEventListener('click', handleAutoSlideToggle);

        // Kick off background tasks
        fetchDiscountPercent();
        loadBrands();
        loadDynamicTopPicksByLifestyle();

        // Wire filters once
        wireFilters();

        // Small reveal and auto-start auto pagination if many brands
        setTimeout(() => {
            const bl = document.getElementById('brandListContainer');
            if (bl) bl.classList.add('slide-in-reveal');
            setTimeout(() => {
                if (currentBrands.length > BRANDSPERPAGE) startAutoPagination();
            }, 800);
        }, 300);

        try { setInterval(fetchDiscountPercent, 30000); } catch (e) { /* ignore */ }

        log('init done');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // -----------------------------------------------------------------------
    // Expose debug API
    // -----------------------------------------------------------------------
    if (typeof window !== 'undefined') {
        window.menPage = window.menPage || {};
        window.menPage.startAutoPagination = startAutoPagination;
        window.menPage.stopAutoPagination = stopAutoPagination;
        window.menPage.loadDynamicTopPicksByLifestyle = loadDynamicTopPicksByLifestyle;
        window.menPage.fetchDiscountPercent = fetchDiscountPercent;
        window.menPage.reloadBrands = async function () { await loadBrands(); };
        window.menPage.debugDump = function () {
            try {
                return {
                    pathname: _PATHNAME,
                    isMenOrWomen: IS_MEN_OR_WOMEN_PAGE,
                    brandsCount: ALL_BRANDS.length,
                    currentBrandsCount: currentBrands.length,
                    currentPage,
                    autoSlideRunning: autoSlideInterval !== null
                };
            } catch (e) { return { error: e && e.message }; }
        };
    }

})();