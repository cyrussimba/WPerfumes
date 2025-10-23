/* brand_detail.js
   Updated: prefer explicit product_id query param (product_id) when present,
   otherwise fall back to brand/product slug. This mirrors the change made to
   the listing page which now passes product_id to guarantee the correct product.
*/

document.addEventListener('DOMContentLoaded', function () {
    const API = "/api";
    const PLACEHOLDER_IMG = document.body && document.body.dataset && document.body.dataset.placeholder ? document.body.dataset.placeholder : '/static/images/placeholder.jpg';

    // Utility: normalize image paths returned by the backend
    function toStaticUrl(url) {
        if (!url) return PLACEHOLDER_IMG;
        if (typeof url !== 'string') return PLACEHOLDER_IMG;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
            return url;
        }
        return `/static/${url}`;
    }

    // Utility: safely read URL param
    function safeParam(name) {
        try {
            return decodeURIComponent(new URLSearchParams(window.location.search).get(name) || '');
        } catch (e) {
            return '';
        }
    }

    // Load similar products (simple approach)
    async function loadSimilarProducts(productId) {
        try {
            const res = await fetch(`${API}/products/similar?product_id=${encodeURIComponent(productId)}`);
            if (!res.ok) {
                console.warn('similar products request failed', res.status);
                return [];
            }
            return await res.json();
        } catch (err) {
            console.warn('loadSimilarProducts error', err);
            return [];
        }
    }

    // Render similar products slider
    function renderSimilarProducts(products) {
        const track = document.getElementById('sliderTrack');
        if (!track) return;
        track.innerHTML = '';
        (products || []).forEach(p => {
            const card = document.createElement('div');
            card.className = 'slider-card';
            const imgSrc = toStaticUrl(p.image_url || p.image_url_dynamic || '');
            card.innerHTML = `
                <img src="${imgSrc}" alt="${p.title}">
                <div class="slider-title">${p.title}</div>
                <div class="muted small">$${parseFloat(p.price || 0).toFixed(2)}</div>
            `;
            card.addEventListener('click', () => {
                const brandParam = encodeURIComponent((p.brand || '').replace(/\s+/g, '_'));
                const productParam = encodeURIComponent((p.title || '').replace(/\s+/g, '_'));
                window.location.href = `/brand/${brandParam}/product/${productParam}`;
            });
            track.appendChild(card);
        });
    }

    // Small helpers for JSON and fetch
    async function safeJson(res) {
        try {
            return await res.json();
        } catch (e) {
            return null;
        }
    }
    async function apiFetch(path, opts = {}) {
        const options = Object.assign({ credentials: 'same-origin' }, opts);
        const res = await fetch(path, options);
        return res;
    }

    // Keep reference to loaded product so buy-now can add it to cart
    window.currentProduct = null;

    // Attach buy-now click to add to cart using the shared addToCart function (from main.js)
    function attachBuyNowHandler() {
        const buyBtn = document.getElementById('addCartBtn'); // intentionally retains id for compatibility
        if (!buyBtn) return;
        buyBtn.addEventListener('click', function (e) {
            e.preventDefault();
            // If currentProduct is set (populated below), use it; otherwise build a minimal product object from DOM
            const prod = window.currentProduct || {
                id: document.getElementById('productName') ? document.getElementById('productName').textContent : (new Date().getTime()),
                title: document.getElementById('productName') ? document.getElementById('productName').textContent : 'Product',
                brand: document.getElementById('brandName') ? document.getElementById('brandName').textContent : '',
                price: (function () {
                    const p = document.getElementById('productPrice');
                    if (!p) return 0;
                    const txt = p.textContent || '';
                    const num = parseFloat(txt.replace(/[^0-9.]+/g, ''));
                    return isNaN(num) ? 0 : num;
                })(),
                image_url: (document.getElementById('productImage') && document.getElementById('productImage').src) ? document.getElementById('productImage').src : ''
            };

            // addToCart is defined in main.js (shared); call it if available
            if (typeof window.addToCart === 'function') {
                addToCart(prod);
            } else {
                // fallback: store in localStorage cart and navigate to /cart
                try {
                    const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
                    const id = prod.id || prod.title;
                    const idx = localCart.findIndex(i => i.id === id);
                    if (idx >= 0) localCart[idx].qty = (localCart[idx].qty || 1) + 1;
                    else localCart.push({ ...prod, id: id, qty: 1 });
                    localStorage.setItem('cart', JSON.stringify(localCart));
                } catch (err) {
                    console.warn('Fallback addToCart failed', err);
                }
                // navigate to cart page (fallback)
                window.location.href = '/cart';
            }
        });
    }

    // Load product details and wire up the page
    (async function initProductPage() {
        // Get query params first (backwards compatible)
        const queryBrand = safeParam('brand') || '';
        const queryProduct = safeParam('product') || '';
        const queryProductId = safeParam('product_id') || '';

        // Start with query params if present, otherwise fall back to path segments:
        let rawBrand = queryBrand;
        let rawProduct = queryProduct;
        let rawProductId = queryProductId;

        if (!rawBrand) {
            try {
                const parts = window.location.pathname.split('/').filter(Boolean);
                if (parts.length >= 2 && parts[0] === 'brand') {
                    rawBrand = decodeURIComponent(parts[1] || '');
                    if (parts.length >= 4 && parts[2] === 'product') {
                        rawProduct = decodeURIComponent(parts[3] || '');
                    }
                }
            } catch (e) {
                console.warn('path parsing failed', e);
            }
        }

        const brandForApi = encodeURIComponent((rawBrand || '').replace(/ /g, '_'));
        const productForApi = encodeURIComponent((rawProduct || '').replace(/ /g, '_'));
        const productIdForApi = encodeURIComponent((rawProductId || '').trim());

        if (!brandForApi) {
            console.warn('No brand specified in query string or path. Attempting to continue with empty brand.');
        }

        // If product_id present prefer the by-id endpoint
        let productApiUrl;
        if (productIdForApi) {
            productApiUrl = `${API}/product_by_id?product_id=${productIdForApi}`;
        } else {
            productApiUrl = `${API}/products/${brandForApi}/${productForApi}`;
        }

        try {
            const res = await fetch(productApiUrl);
            if (!res.ok) {
                console.warn('Product API returned', res.status);
                const nameEl = document.getElementById('productName');
                if (nameEl) nameEl.textContent = 'Product not found';
                return;
            }
            const productData = await res.json();

            // Expose the product on window for buy/Add-to-cart handler
            window.currentProduct = productData;

            // Populate UI
            const pageTitle = document.getElementById('pageTitle');
            if (pageTitle) pageTitle.textContent = `${productData.title} - ${productData.brand}`;
            const pname = document.getElementById('productName');
            if (pname) pname.textContent = productData.title;
            const bname = document.getElementById('brandName');
            if (bname) bname.textContent = productData.brand || '';
            const priceEl = document.getElementById('productPrice');
            if (priceEl) priceEl.textContent = "$" + (parseFloat(productData.price || 0)).toFixed(2);
            const descEl = document.getElementById('productDescription');
            if (descEl) descEl.textContent = productData.description || '';

            // Key notes
            const keyNotesArr = Array.isArray(productData.keyNotes) ? productData.keyNotes :
                (typeof productData.keyNotes === 'string' ? productData.keyNotes.split(';') : []);
            const keyNotesEl = document.getElementById('keyNotes');
            if (keyNotesEl) {
                keyNotesEl.innerHTML = '';
                keyNotesArr.forEach(n => {
                    const text = (typeof n === 'string') ? n.trim() : (n || '');
                    if (text) {
                        const li = document.createElement('li');
                        li.textContent = text;
                        keyNotesEl.appendChild(li);
                    }
                });
            }

            // Thumbnails
            const thumbsCol = document.getElementById('thumbnailsCol');
            if (thumbsCol) thumbsCol.innerHTML = '';
            const thumbnails = typeof productData.thumbnails === 'string' ? productData.thumbnails.split(',').map(s => s.trim()).filter(Boolean) : (productData.thumbnails || []);
            if (thumbnails.length === 0 && productData.image_url) {
                thumbnails.push(productData.image_url);
            }
            thumbnails.forEach((turl, idx) => {
                const img = document.createElement('img');
                img.src = toStaticUrl(turl);
                img.className = 'thumbnail-img';
                img.alt = `Thumbnail ${idx + 1}`;
                img.addEventListener('click', () => {
                    const mainImgEl = document.getElementById('productImage');
                    if (mainImgEl) mainImgEl.src = toStaticUrl(turl);
                    document.querySelectorAll('.thumbnail-img').forEach(x => x.classList.remove('selected'));
                    img.classList.add('selected');
                });
                if (thumbsCol) thumbsCol.appendChild(img);
                if (idx === 0) img.classList.add('selected');
            });

            // Set main image
            const mainImg = document.getElementById('productImage');
            const mainSrc = (thumbnails.length > 0) ? thumbnails[0] : (productData.image_url || '');
            if (mainImg) mainImg.src = toStaticUrl(mainSrc);

            // product tags
            const tagsEl = document.getElementById('productTags');
            if (tagsEl) {
                if (productData.tags) {
                    const tags = typeof productData.tags === 'string' ? productData.tags.split(',').map(s => s.trim()).filter(Boolean) : productData.tags;
                    tagsEl.textContent = 'Tags: ' + tags.join(', ');
                } else {
                    tagsEl.textContent = '';
                }
            }

            // Similar products
            const similar = await loadSimilarProducts(productData.id);
            renderSimilarProducts(similar);

            // Attach buy now handler now that we have productData
            attachBuyNowHandler();

            // (Optional) wishlist button: placeholder behavior (toggle visual only)
            const wishlistBtn = document.getElementById('buyNowBtn');
            if (wishlistBtn) {
                wishlistBtn.addEventListener('click', function () {
                    wishlistBtn.classList.toggle('wish-added');
                    wishlistBtn.textContent = wishlistBtn.classList.contains('wish-added') ? '♥ Wishlist' : '♡ Wishlist';
                    // Persisting wishlist to localStorage/API can be added if you want.
                });
            }

        } catch (err) {
            console.error('Failed to load product', err);
            const nameEl = document.getElementById('productName');
            if (nameEl) nameEl.textContent = 'Product unavailable';
            const descEl = document.getElementById('productDescription');
            if (descEl) descEl.textContent = '';
        }
    })();

});