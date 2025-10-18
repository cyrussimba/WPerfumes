// app/static/js/men.js
// Complete, defensive Men page script.
// Expects main.js (shared cart/checkout) to be loaded before this file.

(function () {
    'use strict';

    const API = "/api";
    const BRANDSPERPAGE = 5;
    let ALL_BRANDS = [];
    let currentBrands = [];
    let currentPage = 1;
    let autoSlideInterval = null;
    const AUTO_SLIDE_DURATION = 4000;

    const PLACEHOLDER_IMG = (typeof window !== 'undefined' && window.PLACEHOLDER_IMG) ? window.PLACEHOLDER_IMG : '/static/images/placeholder.jpg';
    const DEFAULT_PRODUCT_IMG = (typeof window !== 'undefined' && window.DEFAULT_PRODUCT_IMG) ? window.DEFAULT_PRODUCT_IMG : '/static/images/default.jpg';

    const SOCIAL_GROUPS = [
        'Students 📚', 'Skilled Office Workers 💻', 'Models 👠', 'CEOs 🏆', 'Gym Persons 💪',
        'Influencers ✨', 'Creatives 🎨', 'The Traveler ✈️', 'Stay-at-Home Parents 🏡', 'Nightlife Enthusiasts 🍸'
    ];

    function log(...args) { console.debug('men.js:', ...args); }
    function warn(...args) { console.warn('men.js:', ...args); }
    function err(...args) { console.error('men.js:', ...args); }

    function toStaticUrl(url) {
        if (!url) return PLACEHOLDER_IMG;
        if (typeof url !== 'string') return PLACEHOLDER_IMG;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return url;
        return `/static/${url}`;
    }

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
        } catch (e) {
            warn('fetchDiscountPercent error', e);
            const discountInfoDiv = document.getElementById('discountPercentInfo');
            if (discountInfoDiv) discountInfoDiv.style.display = "none";
        }
    }

    // --- Brands paginated list ---
    function displayBrands(brands = [], page = 1) {
        const brandList = document.getElementById('brandList');
        if (!brandList) { warn('#brandList not found'); return; }
        brandList.style.opacity = 0;
        setTimeout(() => {
            brandList.innerHTML = '';
            const start = (page - 1) * BRANDSPERPAGE;
            const end = start + BRANDSPERPAGE;
            const items = brands.slice(start, end);
            if (items.length === 0) {
                brandList.innerHTML = `<li style="color:#888;padding:12px;">No brands found.</li>`;
                brandList.style.opacity = 1;
                return;
            }
            for (const brandObj of items) {
                const li = document.createElement('li');
                const brandName = brandObj.name || 'Unknown Brand';
                li.innerHTML = `
                    <div class="product-image-container">
                        <img src="${toStaticUrl(brandObj.logo)}" alt="${brandName}" class="product-image">
                    </div>
                    <div class="product-name" title="${brandName}">${brandName}</div>
                `;
                li.setAttribute('data-brand', (brandObj.name || '').replace(/ /g, '_'));
                li.addEventListener('click', () => {
                    window.location.href = `/brand?brand=${encodeURIComponent(brandName)}`;
                });
                brandList.appendChild(li);
            }
            brandList.style.opacity = 1;
            log('displayBrands page', page, 'count', items.length);
        }, 120);
    }

    function setupPagination(brands = []) {
        const controls = document.getElementById('paginationControls');
        const toggleBtn = document.getElementById('autoSlideToggle');
        if (!controls || !toggleBtn) { warn('pagination controls or toggle missing'); return; }

        const preserved = toggleBtn.cloneNode(true);
        controls.innerHTML = '';
        controls.appendChild(preserved);

        const pageCount = Math.max(1, Math.ceil(brands.length / BRANDSPERPAGE));
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
        const totalPages = Math.max(1, Math.ceil(currentBrands.length / BRANDSPERPAGE));
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

    // --- Dynamic Top Picks by Lifestyle ---
    async function loadDynamicTopPicksByLifestyle() {
        try {
            const res = await fetch(`${API}/top-picks`);
            if (!res.ok) throw new Error(`top-picks fetch failed (${res.status})`);
            const topPicks = await res.json();

            const prodRes = await fetch(`${API}/products`);
            const products = prodRes.ok ? await prodRes.json() : [];
            const prodMap = {};
            (products || []).forEach(p => { if (p && p.id) prodMap[p.id] = p; });

            const picks = Array.isArray(topPicks) ? topPicks.filter(tp => tp.pushed) : [];
            const container = document.getElementById('dynamicTopPicksByLifestyleContainer');
            if (!container) { warn('dynamicTopPicks container missing'); return; }

            container.innerHTML = '';
            if (picks.length === 0) {
                container.innerHTML = "<div style='color:#888;font-size:1.05em'>No Top Picks by Lifestyle available. Check back soon!</div>";
                return;
            }

            for (const tp of picks) {
                const prod = prodMap[tp.product_id];
                const imgUrl = prod ? (prod.image_url ? toStaticUrl(prod.image_url) : DEFAULT_PRODUCT_IMG) : DEFAULT_PRODUCT_IMG;
                const price = (prod && (prod.price || prod.price === 0)) ? prod.price : (tp.price || '—');
                const reviews = (prod && (prod.reviews_count || prod.reviews_count === 0)) ? prod.reviews_count : (tp.reviews_count || 0);

                const card = document.createElement('div');
                card.className = 'dynamic-top-pick-card';

                const productTitleSafe = tp.product_title || (prod ? prod.title : 'Product');
                const productBrandSafe = tp.brand || (prod ? prod.brand : '');
                const productUrl = prod ? (`/product?id=${encodeURIComponent(prod.id)}`) : (`/product?title=${encodeURIComponent(productTitleSafe)}`);

                card.innerHTML = `
                    <div class="image-wrapper"><img src="${imgUrl}" alt="${productTitleSafe}"></div>
                    <div class="dynamic-top-pick-details">
                        <div class="dynamic-top-pick-title" title="${productTitleSafe}">${productTitleSafe}</div>
                        <div class="dynamic-top-pick-brand">${productBrandSafe}</div>
                        <div class="dynamic-top-pick-meta">
                            <div class="dynamic-top-pick-sales">Top Seller: ${tp.sales_count || 0} sold</div>
                            <div aria-hidden="true">·</div>
                            <div class="dynamic-top-pick-reviews">⭐ ${reviews} reviews</div>
                        </div>
                        <div class="dynamic-top-pick-tags">Lifestyle: ${Array.isArray(tp.tags) ? tp.tags.join(', ') : (tp.tags || '')}</div>
                        <div class="dynamic-top-pick-price">${(price === '—') ? '' : 'From '}${price !== '—' ? 'AED ' + Number(price).toFixed(2) : ''}</div>
                    </div>
                    <div class="dynamic-top-pick-actions">
                        <button class="buy-now" aria-label="Buy ${productTitleSafe} now">Buy Now</button>
                        <button class="wishlist-btn" aria-label="Add ${productTitleSafe} to wishlist">♡ Wishlist</button>
                    </div>
                `;
                container.appendChild(card);

                const buyBtn = card.querySelector('.buy-now');
                if (buyBtn) {
                    buyBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const productForCart = {
                            id: prod ? prod.id : (tp.product_id || productTitleSafe),
                            title: productTitleSafe,
                            price: (prod && (prod.price || prod.price === 0)) ? Number(prod.price) : (tp.price ? Number(tp.price) : 0),
                            image_url: imgUrl
                        };
                        if (typeof addToCart === 'function') {
                            try {
                                addToCart(productForCart);
                            } catch (ex) {
                                warn('addToCart threw', ex);
                                window.location.href = productUrl;
                            }
                        } else {
                            // fallback navigation
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
            } // end loop

            log('loaded dynamic top picks', picks.length);
        } catch (e) {
            err('loadDynamicTopPicksByLifestyle error', e);
            const container = document.getElementById('dynamicTopPicksByLifestyleContainer');
            if (container) container.innerHTML = "<div style='color:#c00'>Failed to load Top Picks.</div>";
        }
    }

    // --- Brands loading ---
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

    // --- Filters wiring ---
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

    // --- Initialization ---
    function init() {
        log('init start');
        // Auto-slide toggle safe wiring
        const autoSlideToggle = document.getElementById('autoSlideToggle');
        if (autoSlideToggle) autoSlideToggle.addEventListener('click', handleAutoSlideToggle);

        // Start background tasks
        fetchDiscountPercent();
        loadBrands();
        loadDynamicTopPicksByLifestyle();

        // Wire filters after possible brand load
        wireFilters();

        // small reveal and auto-start
        setTimeout(() => {
            const bl = document.getElementById('brandListContainer');
            if (bl) bl.classList.add('slide-in-reveal');
            setTimeout(() => {
                if (currentBrands.length > BRANDSPERPAGE) startAutoPagination();
            }, 800);
        }, 300);

        // Periodically refresh discount info (same cadence as main.js)
        try { setInterval(fetchDiscountPercent, 30000); } catch (e) { }
        log('init done');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose a small API for debugging
    if (typeof window !== 'undefined') {
        window.menPage = {
            startAutoPagination,
            stopAutoPagination,
            loadDynamicTopPicksByLifestyle,
            fetchDiscountPercent
        };
    }

})();