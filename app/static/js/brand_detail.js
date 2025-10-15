/* brand_detail.js
   Moved from inline script in templates/brand_detail.html.
   This file runs after DOMContentLoaded and reads placeholder via body data attribute.
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

    // Fetch and return checkout discount percent (0 if not set)
    async function fetchDiscountPercent() {
        try {
            const res = await fetch(`${API}/settings/checkout_discount`);
            if (!res.ok) {
                console.warn('/api/settings/checkout_discount returned', res.status);
                return 0;
            }
            const data = await res.json().catch(() => ({}));
            return parseFloat(data.percent) || 0;
        } catch (err) {
            console.warn('fetchDiscountPercent error', err);
            return 0;
        }
    }

    // LocalStorage cart helpers
    function getCart() {
        try {
            return JSON.parse(localStorage.getItem('cart') || '[]');
        } catch (e) {
            return [];
        }
    }
    function saveCart(cart) {
        localStorage.setItem('cart', JSON.stringify(cart));
    }
    function updateCartNavCount() {
        const cart = getCart();
        const count = cart.reduce((s, it) => s + (it.quantity || it.qty || 0), 0);
        const badge = document.getElementById('cartNavCount');
        if (!badge) return;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    // Render cart modal content
    function renderCartModalCart() {
        const cart = getCart();
        const container = document.getElementById('cartModalCart');
        if (!container) return;
        if (!cart.length) {
            container.innerHTML = '<div style="color:#e74c3c;text-align:center;">Your cart is empty.</div>';
            const form = document.getElementById('cartModalForm');
            if (form) form.style.display = 'none';
            return;
        }
        const rows = cart.map((item, idx) => {
            const qty = item.quantity || item.qty || 1;
            const price = parseFloat(item.price || 0);
            const discounted = price * (1 - (window.checkoutDiscountPercent || 0) / 100);
            const total = (discounted * qty).toFixed(2);
            return `
                <tr>
                    <td style="padding:8px 6px;">${item.title || item.name}</td>
                    <td style="padding:8px 6px; text-align:center;">
                        <button onclick="updateQuantity(${idx}, -1)" style="padding:4px 8px;">-</button>
                        <span style="margin:0 8px;">${qty}</span>
                        <button onclick="updateQuantity(${idx}, 1)" style="padding:4px 8px;">+</button>
                    </td>
                    <td style="padding:8px 6px;">$${(price * qty).toFixed(2)}</td>
                    <td style="padding:8px 6px; color:#27ae60;">$${total}</td>
                    <td style="padding:8px 6px;"><button onclick="removeCartModalItem(${idx})" style="background:#e74c3c;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer;">✕</button></td>
                </tr>
            `;
        }).join('');
        const totalSum = cart.reduce((s, i) => s + (parseFloat(i.price || 0) * (1 - (window.checkoutDiscountPercent || 0) / 100) * (i.quantity || i.qty || 1)), 0).toFixed(2);
        container.innerHTML = `
            <table style="width:100%; border-collapse:collapse;">
                <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Discounted</th><th>Remove</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr><td colspan="3"></td><td style="font-weight:700;color:#27ae60;">$${totalSum}</td><td></td></tr></tfoot>
            </table>
        `;
        const form = document.getElementById('cartModalForm');
        if (form) form.style.display = '';
    }

    // Expose these functions globally because templates call them inline (updateQuantity / removeCartModalItem)
    window.updateQuantity = function (idx, change) {
        const cart = getCart();
        if (!cart[idx]) return;
        const current = cart[idx].quantity || cart[idx].qty || 0;
        const newQty = current + change;
        if (newQty > 0) {
            cart[idx].quantity = newQty;
        } else {
            cart.splice(idx, 1);
        }
        saveCart(cart);
        renderCartModalCart();
        updateCartNavCount();
    };
    window.removeCartModalItem = function (idx) {
        const cart = getCart();
        cart.splice(idx, 1);
        saveCart(cart);
        renderCartModalCart();
        updateCartNavCount();
    };

    // Show/hide cart modal
    function showCartModal() {
        const overlay = document.getElementById('cartModalOverlay');
        if (!overlay) return;
        renderCartModalCart();
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        toggleModalPaymentButtons();
    }
    function hideCartModal() {
        const overlay = document.getElementById('cartModalOverlay');
        if (!overlay) return;
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
    }

    // Toggle payment buttons in the modal based on method
    function toggleModalPaymentButtons() {
        const select = document.getElementById('cartModalPaymentSelect');
        const placeBtn = document.getElementById('modalPlaceOrderBtn');
        const buyBtn = document.getElementById('modalBuyNowBtn');
        if (!select) return;
        if (select.value === 'Cash on Delivery') {
            if (placeBtn) placeBtn.disabled = false;
            if (buyBtn) buyBtn.disabled = true;
        } else {
            if (placeBtn) placeBtn.disabled = true;
            if (buyBtn) buyBtn.disabled = false;
        }
    }

    // Order confirmation modal controls
    function showOrderConfirmation(total) {
        const bg = document.getElementById('orderConfirmationModalBg');
        const msg = document.getElementById('orderConfirmationMsg');
        if (msg) {
            msg.innerHTML = `
                <div style="font-weight:700;color:#27ae60;margin-bottom:8px;">Your order has been received</div>
                <div>Total: $${total}</div>
            `;
        }
        if (bg) bg.style.display = 'flex';
    }
    function hideOrderConfirmation() {
        const bg = document.getElementById('orderConfirmationModalBg');
        if (bg) bg.style.display = 'none';
    }

    // Safe element listener wiring
    const closeCartModalEl = document.getElementById('closeCartModal');
    if (closeCartModalEl) closeCartModalEl.addEventListener('click', () => hideCartModal());
    const cartBtnEl = document.getElementById('cartBtn');
    if (cartBtnEl) cartBtnEl.addEventListener('click', (e) => { e.preventDefault(); showCartModal(); });
    const modalPaymentSelect = document.getElementById('cartModalPaymentSelect');
    if (modalPaymentSelect) modalPaymentSelect.addEventListener('change', toggleModalPaymentButtons);

    // Cart modal form submission
    const cartModalForm = document.getElementById('cartModalForm');
    if (cartModalForm) {
        cartModalForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const cart = getCart();
            if (!cart.length) return;
            const fd = new FormData(this);
            const customer = fd.get('customer') || '';
            const email = fd.get('email') || '';
            const phone = fd.get('phone') || '';
            const address = fd.get('address') || '';
            const payment_method = document.getElementById('cartModalPaymentSelect') ? document.getElementById('cartModalPaymentSelect').value : 'Cash on Delivery';
            const msgDiv = document.getElementById('cartModalMsg');
            if (msgDiv) msgDiv.innerHTML = '';
            let anyFailed = false;

            for (const item of cart) {
                try {
                    const res = await fetch(`${API}/orders`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            customer_name: customer,
                            customer_email: email,
                            customer_phone: phone,
                            customer_address: address,
                            product_id: item.id,
                            product_title: item.title,
                            quantity: item.quantity || item.qty,
                            status: 'Pending',
                            payment_method
                        })
                    });
                    if (!res.ok) {
                        anyFailed = true;
                        const text = await res.text().catch(() => 'Order failed');
                        if (msgDiv) msgDiv.innerHTML += `<div style="color:#e74c3c;">Failed to place order for ${item.title}: ${text}</div>`;
                    }
                } catch (err) {
                    anyFailed = true;
                    if (msgDiv) msgDiv.innerHTML += `<div style="color:#e74c3c;">Network error for ${item.title}</div>`;
                }
            }

            if (!anyFailed) {
                const total = cart.reduce((s, i) => s + (parseFloat(i.price || 0) * (1 - (window.checkoutDiscountPercent || 0) / 100) * (i.quantity || i.qty || 1)), 0).toFixed(2);
                hideCartModal();
                showOrderConfirmation(total);
                setTimeout(() => {
                    localStorage.removeItem('cart');
                    renderCartModalCart();
                    updateCartNavCount();
                    if (document.getElementById('cartModalForm')) document.getElementById('cartModalForm').reset();
                    hideOrderConfirmation();
                }, 3000);
            }
        });
    }

    const modalBuyNowBtn = document.getElementById('modalBuyNowBtn');
    if (modalBuyNowBtn) {
        modalBuyNowBtn.addEventListener('click', function () {
            const total = getCart().reduce((s, i) => s + (parseFloat(i.price || 0) * (1 - (window.checkoutDiscountPercent || 0) / 100) * (i.quantity || i.qty || 1)), 0).toFixed(2);
            hideCartModal();
            showOrderConfirmation(total);
            setTimeout(() => {
                localStorage.removeItem('cart');
                renderCartModalCart();
                updateCartNavCount();
                if (document.getElementById('cartModalForm')) document.getElementById('cartModalForm').reset();
                hideOrderConfirmation();
            }, 3000);
        });
    }

    const orderConfirmationClose = document.getElementById('orderConfirmationModalCloseBtn');
    if (orderConfirmationClose) orderConfirmationClose.addEventListener('click', hideOrderConfirmation);
    const orderConfirmationBg = document.getElementById('orderConfirmationModalBg');
    if (orderConfirmationBg) orderConfirmationBg.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) hideOrderConfirmation();
    });

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

    // Load product details and wire up the page
    let currentProduct = null;
    (async function initProductPage() {
        // Get query params first (backwards compatible)
        const queryBrand = safeParam('brand') || '';
        const queryProduct = safeParam('product') || '';

        // Start with query params if present, otherwise fall back to path segments:
        let rawBrand = queryBrand;
        let rawProduct = queryProduct;

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

        // Fetch discount percent and store globally
        window.checkoutDiscountPercent = await fetchDiscountPercent();
        // Show discount banner if applicable
        const discountDiv = document.getElementById('discountPercentInfo');
        if (discountDiv && window.checkoutDiscountPercent > 0) {
            discountDiv.style.display = 'block';
            discountDiv.innerHTML = `<span>🌟 <b>Special Offer:</b> <span style="color:#27ae60">${window.checkoutDiscountPercent}% OFF</span> applied automatically!</span>`;
            const modalDiscountInfo = document.getElementById('cartModalDiscountInfo');
            if (modalDiscountInfo) {
                modalDiscountInfo.style.display = 'block';
                modalDiscountInfo.innerHTML = `<span>🌟 <b>Special Offer:</b> <span style="color:#27ae60">${window.checkoutDiscountPercent}% OFF</span> applied automatically!</span>`;
            }
        }

        if (!brandForApi) {
            console.warn('No brand specified in query string or path. Attempting to continue with empty brand.');
        }

        const productApiUrl = `${API}/products/${brandForApi}/${productForApi}`;

        try {
            const res = await fetch(productApiUrl);
            if (!res.ok) {
                console.warn('Product API returned', res.status);
                const nameEl = document.getElementById('productName');
                if (nameEl) nameEl.textContent = 'Product not found';
                return;
            }
            const productData = await res.json();
            // Save product
            currentProduct = {
                id: productData.id,
                title: productData.title,
                price: parseFloat(productData.price || 0),
                image_url: productData.image_url || productData.image_url_dynamic || ''
            };

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

        } catch (err) {
            console.error('Failed to load product', err);
            const nameEl = document.getElementById('productName');
            if (nameEl) nameEl.textContent = 'Product unavailable';
            const descEl = document.getElementById('productDescription');
            if (descEl) descEl.textContent = '';
        }
    })();

    // Add-to-cart behavior
    const addCartBtn = document.getElementById('addCartBtn');
    if (addCartBtn) {
        addCartBtn.addEventListener('click', function () {
            if (!currentProduct) return;
            const cart = getCart();
            const idx = cart.findIndex(i => i.id === currentProduct.id);
            if (idx === -1) {
                cart.push({ ...currentProduct, quantity: 1 });
            } else {
                cart[idx].quantity = (cart[idx].quantity || 0) + 1;
            }
            saveCart(cart);
            updateCartNavCount();
            showCartModal();
        });
    }

    const buyNowBtn = document.getElementById('buyNowBtn');
    if (buyNowBtn) {
        buyNowBtn.addEventListener('click', function () {
            if (!currentProduct) return;
            const cart = getCart();
            const idx = cart.findIndex(i => i.id === currentProduct.id);
            if (idx === -1) {
                cart.push({ ...currentProduct, quantity: 1 });
            } else {
                cart[idx].quantity = (cart[idx].quantity || 0) + 1;
            }
            saveCart(cart);
            updateCartNavCount();
            showCartModal();
            const select = document.getElementById('cartModalPaymentSelect');
            if (select) { select.value = 'Visa/Mastercard'; toggleModalPaymentButtons(); }
        });
    }

    // Initialize cart badge
    updateCartNavCount();

    // Keyboard shortcut for cart (C key)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'c' || e.key === 'C') {
            showCartModal();
        }
    });

    // Accessibility: Escape to close cart modal
    const cartModalOverlay = document.getElementById('cartModalOverlay');
    if (cartModalOverlay) {
        cartModalOverlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideCartModal();
        });
    }

    // Poll discount updates periodically
    setInterval(async () => {
        const newPercent = await fetchDiscountPercent();
        if (typeof newPercent === 'number' && newPercent !== window.checkoutDiscountPercent) {
            window.checkoutDiscountPercent = newPercent;
            const div = document.getElementById('discountPercentInfo');
            if (div) {
                if (newPercent > 0) {
                    div.style.display = 'block';
                    div.innerHTML = `<span>🌟 <b>Special Offer:</b> <span style="color:#27ae60">${newPercent}% OFF</span> applied automatically!</span>`;
                } else {
                    div.style.display = 'none';
                }
            }
            renderCartModalCart();
        }
    }, 30000);

    // small helpers for JSON and fetch
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
});