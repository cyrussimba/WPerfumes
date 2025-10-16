// Updated main.js - uses relative API base and defensive DOM handling
// Enhanced: unified button state helper and payment-selection logic so that
// clicking "Add to Cart" shows a popup, and switching payment method (Cash on Delivery
// vs Visa/Mastercard) updates "Place Order" and "Buy Now" appearance and behavior.
//
// Drop-in replacement for existing main.js. Paste into your repository to replace the old file.

const API = "/api";

const SECTIONS = {
    signature: "Our Signature Perfumes",
    men: "Men's Brands",
    women: "Women's Brands",
    offers: "Hot Offers"
};

// Helpers for rounding/display
function roundInteger(value) {
    return Math.round(Number(value) || 0);
}
function formatPriceInteger(value) {
    return `$${roundInteger(value)}`;
}

// Unified Cart state, loaded from localStorage
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let appliedPromo = null;
let promoDiscountValue = 0;
let promoDiscountType = null;
let checkoutDiscountPercent = 0;

/*
 * Button state helper
 * btn: DOM element
 * enabled: boolean
 * opts: optional object {activeBg, disabledBg, activeTextColor, disabledTextColor, reason}
 *
 * This centralizes visual + accessibility updates for action buttons such as
 * "Place Order" and "Buy Now" across modals/pages.
 */
function setButtonState(btn, enabled, opts = {}) {
    if (!btn) return;
    btn.disabled = !enabled;
    const reason = opts.reason || '';
    // accessibility
    btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    if (!enabled && reason) btn.setAttribute('title', reason);
    else btn.removeAttribute('title');

    // visual: class + inline color fallback (ensures style even if CSS missing)
    btn.classList.remove('btn-active', 'btn-disabled');
    if (enabled) {
        btn.classList.add('btn-active');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        if (opts.activeBg) btn.style.background = opts.activeBg;
        if (opts.activeTextColor) btn.style.color = opts.activeTextColor;
    } else {
        btn.classList.add('btn-disabled');
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
        if (opts.disabledBg) btn.style.background = opts.disabledBg;
        if (opts.disabledTextColor) btn.style.color = opts.disabledTextColor;
    }
}

// --- PROMO DISCOUNT FETCH & DISPLAY ---
async function fetchAndDisplayDiscountInfo() {
    let percent = 0;
    try {
        const r = await fetch(`${API}/settings/checkout_discount`);
        if (r.ok) {
            const js = await r.json().catch(() => ({}));
            percent = parseFloat(js.percent) || 0;
        } else {
            percent = 0;
        }
    } catch (err) {
        percent = 0;
        console.warn('fetchAndDisplayDiscountInfo error', err);
    }
    checkoutDiscountPercent = percent;

    // Cart Modal info
    const cartDiscDiv = document.getElementById('cartDiscountInfo');
    if (cartDiscDiv) {
        if (percent > 0) {
            cartDiscDiv.style.display = "block";
            cartDiscDiv.innerHTML = `<span>🌟 <b>Special Offer:</b> <span style="color:#27ae60">${percent}% OFF</span> applied automatically at checkout!</span>`;
        } else {
            cartDiscDiv.style.display = "none";
            cartDiscDiv.innerHTML = "";
        }
    }

    // Checkout Modal info
    const checkoutDiscDiv = document.getElementById('checkoutDiscountInfo') || document.getElementById('modalDiscountInfo') || document.getElementById('discountPercentInfo');
    if (checkoutDiscDiv) {
        if (percent > 0) {
            checkoutDiscDiv.style.display = "block";
            checkoutDiscDiv.innerHTML = `<span>🌟 <b>Special Offer:</b> <span style="color:#27ae60">${percent}% OFF</span> applied automatically at checkout!</span>`;
        } else {
            checkoutDiscDiv.style.display = "none";
            checkoutDiscDiv.innerHTML = "";
        }
    }

    // Homepage Blinking Offer Banner
    const blinkingOfferDiv = document.getElementById('blinking-offer');
    if (blinkingOfferDiv) {
        if (percent > 0) {
            blinkingOfferDiv.style.display = 'block';
            blinkingOfferDiv.innerHTML =
                `🌟 <b>Special Offer:</b> <span style="color:#27ae60">${percent}% OFF</span> applied automatically at checkout & in your cart!`;
            blinkingOfferDiv.classList.add('promo-visible');
        } else {
            blinkingOfferDiv.style.display = 'none';
            blinkingOfferDiv.innerHTML = '';
            blinkingOfferDiv.classList.remove('promo-visible');
        }
    }
}

// --- Order Confirmation Modal ---
function showOrderConfirmation(total) {
    const el = document.getElementById('orderConfirmationMsg') || document.getElementById('orderConfirmationMsg');
    if (el) {
        el.innerHTML = `
        <div class="success-msg" style="margin-bottom:8px;">
            Your Order has been received. Please check your Email.
        </div>
        <div class="order-total-msg" style="color:#27ae60;font-size:1.05em;">
            Total is ${formatPriceInteger(total)}
        </div>
    `;
        const bg = document.getElementById('orderConfirmationModalBg');
        if (bg) bg.style.display = 'flex';
    }
}
function hideOrderConfirmation() {
    const bg = document.getElementById('orderConfirmationModalBg');
    if (bg) bg.style.display = 'none';
}

// --- Cart State Functions ---
function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function findCartIndexById(id) {
    return cart.findIndex(item => item.id === id);
}

function updateCartCount() {
    const cartCountEl = document.getElementById('cartCountBadge');
    if (!cartCountEl) return;
    const totalQty = cart.reduce((sum, item) => sum + (item.qty || item.quantity || 0), 0);
    if (totalQty > 0) {
        cartCountEl.textContent = totalQty;
        cartCountEl.style.display = 'flex';
    } else {
        cartCountEl.style.display = 'none';
    }
}

/*
 * When adding to cart we show a popup (checkout if available, otherwise cart modal).
 * This aligns with your request: user clicks "Add to Cart" -> sees a popup window.
 */
function addToCart(product) {
    const id = product.id || product.title;
    const idx = findCartIndexById(id);
    if (idx >= 0) {
        cart[idx].qty = (cart[idx].qty || cart[idx].quantity || 1) + 1;
    } else {
        cart.push({ ...product, id: id, qty: 1 });
    }
    saveCart();
    updateCartCount();

    // Prefer opening the checkout popup (in-page) for quick checkout flow.
    // If unavailable, fall back to cart modal; otherwise navigate to /cart.
    if (document.getElementById('checkoutModalBg')) {
        showCheckoutModal();
    } else if (document.getElementById('cartModalBg')) {
        showCartModal();
    } else {
        // navigate to dedicated cart page (link consistent with templates)
        window.location.href = (typeof window !== 'undefined') ? '/cart' : '';
    }
}

// --- Cart Modal Functions ---
function showCartModal() {
    const bg = document.getElementById("cartModalBg");
    if (bg) bg.style.display = 'flex';
    fetchAndDisplayDiscountInfo();
    renderCartModal();
}
function hideCartModal() {
    const bg = document.getElementById("cartModalBg");
    if (bg) bg.style.display = 'none';
}
function renderCartModal() {
    const cartListDiv = document.getElementById('cartList');
    if (!cartListDiv) return;
    if (cart.length === 0) {
        cartListDiv.innerHTML = `<div class="cart-modal-empty">Your cart is empty.</div>`;
        const totalEl = document.getElementById('cartModalTotal');
        if (totalEl) totalEl.textContent = '';
        const cartDiscDiv = document.getElementById('cartDiscountInfo');
        if (cartDiscDiv) cartDiscDiv.style.display = "none";
        // ensure checkout button is disabled when no items
        const checkoutBtn = document.getElementById('openCheckoutFromCart');
        if (checkoutBtn) setButtonState(checkoutBtn, false, { disabledBg: '#ccc', reason: 'Cart is empty' });
        return;
    }
    let html = '';
    let total = 0, discountedTotal = 0;
    for (const [idx, item] of cart.entries()) {
        const price = (item.price || 0) * (item.qty || item.quantity || 1);
        total += price;
        let discountedPrice = price;
        if (checkoutDiscountPercent > 0) {
            discountedPrice = price * (1 - checkoutDiscountPercent / 100);
        }
        discountedTotal += discountedPrice;
        html += `
        <div class="cart-list-item" data-id="${item.id}">
            <div class="cart-list-details">
                <img class="cart-list-img" src="${item.image_url || item.image || ''}" alt="${item.title}">
                <div>
                    <div class="cart-list-title">${item.title}</div>
                    <div class="cart-list-price">$${(item.price || 0).toFixed(2)}</div>
                </div>
            </div>
            <div class="cart-qty-controls">
                <button class="cart-qty-btn" onclick="updateCartModalQuantity(${idx}, -1)">-</button>
                <span class="cart-qty-display">${item.qty || item.quantity || 1}</span>
                <button class="cart-qty-btn" onclick="updateCartModalQuantity(${idx}, 1)">+</button>
            </div>
        </div>`;
    }
    cartListDiv.innerHTML = html;
    // Display totals as integers (rounded)
    let totalHtml = `Total: ${formatPriceInteger(total)}`;
    if (checkoutDiscountPercent > 0) {
        totalHtml += `<br><span style="color:#27ae60;font-size:0.98em;">After Discount: ${formatPriceInteger(discountedTotal)} (-${checkoutDiscountPercent}%)</span>`;
    }
    const cartTotalEl = document.getElementById('cartModalTotal');
    if (cartTotalEl) cartTotalEl.innerHTML = totalHtml;

    // ensure checkout anchor is enabled
    const checkoutBtn = document.getElementById('openCheckoutFromCart');
    if (checkoutBtn) setButtonState(checkoutBtn, true, { activeBg: '#2d8f7c', activeTextColor: '#fff' });
}

window.updateCartModalQuantity = function (idx, change) {
    if (cart[idx]) {
        const newQty = (cart[idx].qty || cart[idx].quantity || 1) + change;
        if (newQty > 0) {
            cart[idx].qty = newQty;
        } else {
            cart.splice(idx, 1);
        }
        saveCart();
        updateCartCount();
        renderCartModal();
    }
}

// --- Checkout Modal Functions ---
function showCheckoutModal() {
    const bg = document.getElementById("checkoutModalBg");
    if (bg) bg.style.display = 'flex';
    fetchAndDisplayDiscountInfo();
    renderCheckoutView();
}
function hideCheckoutModal() {
    const bg = document.getElementById("checkoutModalBg");
    if (bg) bg.style.display = 'none';
}

/*
 * togglePaymentButtons
 * Updates the enabled/disabled state + visual styles for "Place Order" (checkoutBtn)
 * and "Buy Now" (buyNowBtn) based on the selected payment method.
 *
 * Applies to the checkout modal present in index.html (ids: paymentSelect, checkoutBtn, buyNowBtn)
 * and also to the modal variant (ids: modal_paymentSelect, modalPlaceOrderBtn, modalBuyNowBtn),
 * and fallback selectors commonly used across templates.
 */
function togglePaymentButtons() {
    // list of contexts we should update (main checkout, modal, etc)
    const contexts = [
        { paymentId: 'paymentSelect', placeId: 'checkoutBtn', buyId: 'buyNowBtn' },
        { paymentId: 'modal_paymentSelect', placeId: 'modalPlaceOrderBtn', buyId: 'modalBuyNowBtn' },
        { paymentId: 'paymentSelect', placeId: 'checkoutBtn', buyId: 'buyNowBtn' } // redundancy ok
    ];

    contexts.forEach(ctx => {
        const paymentEl = document.getElementById(ctx.paymentId);
        const placeBtn = document.getElementById(ctx.placeId);
        const buyBtn = document.getElementById(ctx.buyId);
        const hintEl = document.getElementById((ctx.paymentId === 'modal_paymentSelect') ? 'modalPaymentHint' : 'modalPaymentHint') || document.getElementById('modalPaymentHint') || document.getElementById('paymentHint');

        if (!paymentEl) {
            // nothing to do for this context
            return;
        }
        const payment = paymentEl.value || 'Cash on Delivery';

        if (!cart || !cart.length) {
            // no items: both disabled
            setButtonState(placeBtn, false, { disabledBg: '#ccc', reason: 'Cart is empty' });
            setButtonState(buyBtn, false, { disabledBg: '#ccc', reason: 'Cart is empty' });
            if (hintEl) hintEl.innerText = 'Your cart is empty.';
            return;
        }

        if (payment === 'Cash on Delivery' || payment === 'Cash on delivery') {
            // Place Order enabled, Buy Now disabled
            setButtonState(placeBtn, true, { activeBg: '#2d8f7c', activeTextColor: '#fff' });
            setButtonState(buyBtn, false, { disabledBg: '#bdbdbd', disabledTextColor: '#fff', reason: 'Buy Now requires card payment (Visa/Mastercard).' });
            if (hintEl) hintEl.innerText = 'Cash on Delivery selected — use "Place Order".';
        } else {
            // Card payment: Buy Now enabled, Place Order disabled
            setButtonState(placeBtn, false, { disabledBg: '#bdbdbd', disabledTextColor: '#fff', reason: 'Place Order is disabled for card payments.' });
            setButtonState(buyBtn, true, { activeBg: '#4aa3ff', activeTextColor: '#fff' });
            if (hintEl) hintEl.innerText = `${payment} selected — use "Buy Now" to pay with card.`;
        }
    });
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + (item.price || 0) * (item.qty || item.quantity || 1), 0);
}

function getDiscountedTotal() {
    let total = getCartTotal();
    let discount = checkoutDiscountPercent || 0;
    if (appliedPromo && promoDiscountType && promoDiscountValue) {
        // Promo code discount overrides checkout discount
        if (promoDiscountType === 'percent') {
            discount = promoDiscountValue;
            return total * (1 - (discount / 100));
        } else if (promoDiscountType === 'fixed') {
            return Math.max(0, total - promoDiscountValue);
        }
    }
    return total * (1 - (discount / 100));
}

function renderCheckoutView() {
    const cartSection = document.getElementById('cartSection');
    const paymentWrapper = document.getElementById("paymentSelectWrapper");
    const orderForm = document.getElementById("orderForm");
    const promoWrapper = document.getElementById("promoWrapper");

    if (!cartSection) return;

    if (!cart.length) {
        cartSection.innerHTML = '<div class="cart-empty">Your cart is empty.</div>';
        if (orderForm) orderForm.style.display = "none";
        if (paymentWrapper) paymentWrapper.style.display = "none";
        if (promoWrapper) promoWrapper.style.display = "none";
        const checkoutDiscDiv = document.getElementById('checkoutDiscountInfo');
        if (checkoutDiscDiv) checkoutDiscDiv.style.display = "none";
        // disable buttons when empty
        togglePaymentButtons();
        return;
    }

    // Build table rows for items (prices shown as integers for totals)
    let html = `<table>
        <thead>
            <tr>
                <th>Product</th>
                <th style="width:120px;">Qty</th>
                <th>Price</th>
                <th>Remove</th>
            </tr>
        </thead>
        <tbody>
        ${cart.map((item, idx) => `
        <tr>
            <td>${item.title}</td>
            <td style="display:flex; align-items:center; gap:5px; padding-top: 10px; padding-bottom: 10px;">
                <button type="button" onclick="updateCheckoutQuantity(${idx}, -1)" class="qty-control-btn">-</button>
                <span style="min-width: 20px; text-align: center;">${item.qty || item.quantity || 1}</span>
                <button type="button" onclick="updateCheckoutQuantity(${idx}, 1)" class="qty-control-btn">+</button>
            </td>
            <td>$${((item.price || 0) * (item.qty || item.quantity || 1)).toFixed(2)}</td>
            <td>
                <button type="button" onclick="removeCheckoutItem(${idx})" 
                        style="background:#e74c3c;padding:2px 9px;border-radius:4px; font-weight: bold; width: 30px; height: 30px; line-height: 1;">✕</button>
            </td>
        </tr>`).join('')}
        </tbody>
        <tfoot>
            <tr>
                <td colspan="3" class="total">Total:</td>
                <td class="total">${formatPriceInteger(getCartTotal())}</td>
            </tr>
            ${(checkoutDiscountPercent || (appliedPromo && promoDiscountType && promoDiscountValue)) ? `
            <tr>
                <td colspan="3" class="total" style="color:#27ae60;">${appliedPromo ? `Promo (${appliedPromo})` : 'Discount'}:</td>
                <td class="total" style="color:#27ae60;">
                    -${formatPriceInteger(getCartTotal() - getDiscountedTotal())}
                </td>
            </tr>
            <tr>
                <td colspan="3" class="total">Total after Discount:</td>
                <td class="total"><b>${formatPriceInteger(getDiscountedTotal())}</b></td>
            </tr>` : ''}
        </tfoot>
    </table>`;

    cartSection.innerHTML = html;
    if (paymentWrapper) paymentWrapper.style.display = "block";
    if (promoWrapper) promoWrapper.style.display = "block";
    if (orderForm) orderForm.style.display = "block";

    // Update payment buttons state after rendering
    togglePaymentButtons();
}

window.removeCheckoutItem = function (idx) {
    cart.splice(idx, 1);
    saveCart();
    updateCartCount();
    renderCheckoutView();
};

window.updateCheckoutQuantity = function (idx, change) {
    if (cart[idx]) {
        const newQuantity = (cart[idx].qty || cart[idx].quantity || 1) + change;
        if (newQuantity > 0) {
            cart[idx].qty = newQuantity;
        } else {
            cart.splice(idx, 1);
        }
        saveCart();
        updateCartCount();
        renderCheckoutView();
    }
};

async function logOrderAttempt(item, status = "Carted") {
    const emailEl = document.getElementById("email");
    const email = emailEl ? emailEl.value : "";
    try {
        await fetch(`${API}/order-attempts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, product: item.title, qty: item.qty || item.quantity || 1, status })
        });
    } catch (error) { /* ignore network errors */ }
}

// --- Homepage Loading & Product Listeners ---
function createSignatureSection(products) {
    let html = `<section id="signature">
        <div class="section-heading-row signature">
            <h3 class="signature">Our Signature Perfumes</h3>
        </div>
        <hr class="section-divider">
        <div class="card-section-wrapper">
            <div class="card-container">`;
    if (!products || products.length === 0) {
        html += `<div style="padding:20px;color:#aaa;">No products available yet.</div>`;
    } else {
        for (const p of products) {
            html += `
            <div class="product-card">
                <div class="card-image-wrapper">
                    <img src="${p.image_url}" alt="${p.title}" class="product-image">
                </div>
                <div class="card-details">
                    <div class="card-name">${p.title}</div>
                    <small>$${p.price}</small>
                </div>
                <button class="add-cart-btn" data-product='${JSON.stringify({ ...p, id: p.id || p.title })}'>Add to Cart</button>
            </div>`;
        }
    }
    html += `</div></div></section>`;
    return html;
}

function createSection(sectionKey, products) {
    if (sectionKey === 'signature') {
        return createSignatureSection(products);
    }
    const headingRowClass = sectionKey === 'signature' ? 'section-heading-row signature' : 'section-heading-row';
    let html = `<section id="${sectionKey}">
        <div class="${headingRowClass}">
            <h3 class="${sectionKey === 'signature' ? 'signature' : ''}">${SECTIONS[sectionKey]}</h3>
        </div>
        <hr class="section-divider">
        <div class="card-section-wrapper">
            <div class="card-container">`;
    if (!products || products.length === 0) {
        html += `<div style="padding:20px;color:#aaa;">No products available yet.</div>`;
    } else {
        for (const p of products) {
            html += `
            <div class="product-card">
                <div class="card-image-wrapper">
                    <img src="${p.image_url}" alt="${p.title}" class="product-image">
                </div>
                <div class="card-details">
                    <div class="card-name">${p.title}</div>
                    <small>$${p.price}</small>
                </div>
                <button class="add-cart-btn" data-product='${JSON.stringify({ ...p, id: p.id || p.title })}'>Add to Cart</button>
            </div>`;
        }
    }
    html += `</div></div></section>`;
    return html;
}

async function loadHomepageSections() {
    try {
        const res = await fetch(`${API}/homepage-products`);
        if (!res.ok) {
            console.warn('loadHomepageSections: failed to fetch homepage products');
            return;
        }
        const data = await res.json();
        let html = '';
        for (const key of Object.keys(SECTIONS)) {
            html += createSection(key, data[key] || []);
        }
        const containerEl = document.getElementById("homepage-sections");
        if (containerEl) containerEl.innerHTML = html;

        const sigSection = document.getElementById("signature");
        if (!sigSection) return;
        const container = sigSection.querySelector(".card-container");
        if (!container) return;

        container.style.animation = "none";

        function getScrollDistance() {
            const parentWidth = sigSection.querySelector(".card-section-wrapper").offsetWidth;
            const cardsWidth = container.scrollWidth;
            if (cardsWidth <= parentWidth) return 0;
            return cardsWidth - parentWidth;
        }

        let direction = 1, pos = 0, scrollDist = getScrollDistance(), speed = 0.8, rafId = null;

        function animate() {
            scrollDist = getScrollDistance();
            if (scrollDist <= 0) {
                container.style.transform = "translateX(0)";
                return;
            }
            pos += speed * direction;
            if (pos >= scrollDist) { pos = scrollDist; direction = -1; }
            else if (pos <= 0) { pos = 0; direction = 1; }
            container.style.transform = `translateX(${-pos}px)`;
            rafId = requestAnimationFrame(animate);
        }

        function startAnim() {
            if (rafId) cancelAnimationFrame(rafId);
            pos = 0;
            direction = 1;
            container.style.transform = "translateX(0)";
            scrollDist = getScrollDistance();
            if (scrollDist > 0) rafId = requestAnimationFrame(animate);
        }
        startAnim();
        container.addEventListener("mouseenter", () => { if (rafId) cancelAnimationFrame(rafId); });
        container.addEventListener("mouseleave", () => { rafId = requestAnimationFrame(animate); });
        window.addEventListener("resize", startAnim);

        document.querySelectorAll('.add-cart-btn').forEach(btn => {
            btn.onclick = function (e) {
                e.stopPropagation();
                const product = JSON.parse(this.getAttribute('data-product'));
                addToCart(product);
            };
        });

        attachProductCardListeners();
    } catch (err) {
        console.warn('loadHomepageSections error', err);
    }
}

function getProductDetailApiUrl(brand, title) {
    const apiBrand = encodeURIComponent(brand.replace(/ /g, "_"));
    const apiProduct = encodeURIComponent(title.replace(/ /g, "_"));
    return `${API}/products/${apiBrand}/${apiProduct}`;
}

function showProductDetailOverlay(card, brand, title) {
    const overlay = document.getElementById('productDetailOverlay');
    const overlayContent = document.getElementById('overlayContent');
    if (!overlay || !overlayContent) return;
    overlay.style.display = "block";
    overlay.style.left = (card.getBoundingClientRect().left + window.scrollX + card.offsetWidth + 10) + "px";
    overlay.style.top = (card.getBoundingClientRect().top + window.scrollY - 20) + "px";
    overlayContent.innerHTML = "Loading...";
    fetch(getProductDetailApiUrl(brand, title))
        .then(res => res.json())
        .then(product => {
            overlayContent.innerHTML = `
                <img src="${product.image_url}" alt="${product.title}" />
                <h2>${product.title}</h2>
                <div class="overlay-brand">${product.brand}</div>
                <div class="overlay-price">$${product.price}</div>
                <div class="overlay-desc">${product.description}</div>
                <div class="overlay-notes"><b>Key Notes:</b> ${Array.isArray(product.keyNotes) ? product.keyNotes.join(', ') : product.keyNotes}</div>
                <div class="overlay-tags"><b>Tags:</b> ${product.tags || 'None'}</div>
            `;
        })
        .catch(err => {
            overlayContent.innerHTML = '<div style="color:#c00;">Failed to load product details.</div>';
            console.warn('showProductDetailOverlay error', err);
        });
}

function hideProductDetailOverlay() {
    const overlay = document.getElementById('productDetailOverlay');
    if (overlay) overlay.style.display = "none";
}

function attachProductCardListeners() {
    document.querySelectorAll('.product-card').forEach(card => {
        let productData = null;
        const btn = card.querySelector('.add-cart-btn');
        if (btn) {
            try { productData = JSON.parse(btn.getAttribute('data-product')); } catch (e) { productData = null; }
        }
        let brand = productData?.brand || '';
        let title = productData?.title || productData?.name || '';

        card.onclick = function (e) {
            if (e.target && e.target.classList && e.target.classList.contains('add-cart-btn')) return;
            if (brand && title) {
                // Navigate to brand/product page if such a route exists in your app
                window.location.href = `/brand/${encodeURIComponent(brand)}/product/${encodeURIComponent(title)}`;
            }
        };
        card.onmouseenter = function () { if (brand && title) showProductDetailOverlay(card, brand, title); };
        card.onmouseleave = hideProductDetailOverlay;
    });
}

document.getElementById && document.getElementById('overlayCloseBtn') && (document.getElementById('overlayCloseBtn').onclick = hideProductDetailOverlay);

// Initialization: attach listeners and wire up payment-selection logic
document.addEventListener('DOMContentLoaded', function () {
    // Cart modal listeners
    const cartBtn = document.getElementById('cartBtn');
    const cartModalClose = document.getElementById('cartModalCloseBtn');
    const cartModalBg = document.getElementById('cartModalBg');
    if (cartBtn) cartBtn.addEventListener('click', (e) => { e.preventDefault(); showCartModal(); });
    if (cartModalClose) cartModalClose.addEventListener('click', hideCartModal);
    if (cartModalBg) cartModalBg.addEventListener('click', (e) => { if (e.target === e.currentTarget) hideCartModal(); });

    // Checkout modal listeners
    const checkoutClose = document.getElementById('checkoutModalCloseBtn');
    const checkoutBg = document.getElementById('checkoutModalBg');
    const paymentSelect = document.getElementById('paymentSelect');
    if (checkoutClose) checkoutClose.addEventListener('click', hideCheckoutModal);
    if (checkoutBg) checkoutBg.addEventListener('click', (e) => { if (e.target === e.currentTarget) hideCheckoutModal(); });
    if (paymentSelect) paymentSelect.addEventListener('change', togglePaymentButtons);

    // modal payment select in cart.html or cart modal (different ids)
    const modalPaymentSelect = document.getElementById('modal_paymentSelect');
    if (modalPaymentSelect) modalPaymentSelect.addEventListener('change', togglePaymentButtons);

    // promo code apply logic (checkout page)
    const applyPromoBtn = document.getElementById('applyPromoBtn');
    if (applyPromoBtn) {
        applyPromoBtn.onclick = async function () {
            const codeEl = document.getElementById('promoInput');
            const msgDiv = document.getElementById('promoMsg');
            const code = codeEl ? codeEl.value.trim() : '';
            if (msgDiv) msgDiv.textContent = '';
            if (!code) {
                if (msgDiv) msgDiv.textContent = 'Please enter a promo code.';
                return;
            }
            if (msgDiv) msgDiv.textContent = 'Checking...';
            try {
                const res = await fetch(`${API}/coupons`);
                if (!res.ok) throw new Error('Failed to fetch coupons');
                const promos = await res.json();
                const today = new Date().toISOString().slice(0, 10);
                const found = promos.find(p =>
                    p.code.toLowerCase() === code.toLowerCase() &&
                    p.active &&
                    (!p.start_date || p.start_date <= today) &&
                    (!p.end_date || p.end_date >= today)
                );
                if (!found) {
                    appliedPromo = null;
                    promoDiscountValue = 0;
                    promoDiscountType = null;
                    if (msgDiv) msgDiv.textContent = "Invalid or expired promo code.";
                    renderCheckoutView();
                } else {
                    appliedPromo = found.code;
                    promoDiscountType = found.discount_type;
                    promoDiscountValue = found.discount_value;
                    if (msgDiv) msgDiv.textContent = `Promo applied: ${found.description} (${found.discount_type === 'percent' ? found.discount_value + '%' : '$' + found.discount_value} off)`;
                    renderCheckoutView();
                }
            } catch (err) {
                if (msgDiv) msgDiv.textContent = "Error checking promo code.";
                console.warn('applyPromoBtn error', err);
            }
        };
    }

    // Checkout form submission (main checkout modal)
    const orderForm = document.getElementById('orderForm');
    if (orderForm) {
        orderForm.onsubmit = async function (e) {
            e.preventDefault();
            if (!cart.length) return;
            const customer = (document.getElementById('customer') || {}).value || '';
            const email = (document.getElementById('email') || {}).value || '';
            const phone = (document.getElementById('phone') || {}).value || '';
            const address = (document.getElementById('address') || {}).value || '';
            const payment_method = (document.getElementById('paymentSelect') || {}).value || '';
            let anyFailed = false;
            let msgDiv = document.getElementById('orderMsg');
            if (msgDiv) msgDiv.innerHTML = "";

            const checkoutBtn = document.getElementById('checkoutBtn');
            const buyNowBtn = document.getElementById('buyNowBtn');
            if (checkoutBtn) setButtonState(checkoutBtn, false, { disabledBg: '#ccc' });
            if (buyNowBtn) setButtonState(buyNowBtn, false, { disabledBg: '#ccc' });

            for (const item of cart) {
                await logOrderAttempt(item, "CheckedOut");
                try {
                    const res = await fetch(`${API}/orders`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            customer, email, phone, address,
                            product: item.title,
                            qty: item.qty || item.quantity || 1,
                            status: "Pending",
                            payment_method,
                            promo_code: appliedPromo || undefined
                        })
                    });
                    if (!res.ok) throw new Error('Order placement failed');
                } catch (error) {
                    anyFailed = true;
                    if (msgDiv) msgDiv.innerHTML += `<div class="error-msg">Network error: Failed to place order for ${item.title}.</div>`;
                    console.warn('order submission error', error);
                }
            }

            if (!anyFailed) {
                // Show confirmation modal and then clear cart
                const orderTotal = getDiscountedTotal(); // pass numeric total
                hideCheckoutModal();
                showOrderConfirmation(orderTotal);

                setTimeout(() => {
                    cart = [];
                    appliedPromo = null;
                    promoDiscountValue = 0;
                    promoDiscountType = null;
                    saveCart();
                    renderCheckoutView();
                    updateCartCount();
                    if (orderForm) orderForm.reset();
                    const promoInput = document.getElementById('promoInput');
                    if (promoInput) promoInput.value = '';
                    const promoMsg = document.getElementById('promoMsg');
                    if (promoMsg) promoMsg.textContent = '';
                    hideOrderConfirmation();
                }, 4000);
            } else {
                togglePaymentButtons();
            }
        };
    }

    // Buy Now button in checkout modal (simulate card payment)
    const buyNowBtn = document.getElementById('buyNowBtn');
    if (buyNowBtn) {
        buyNowBtn.addEventListener('click', function () {
            const orderTotal = getDiscountedTotal();
            hideCheckoutModal();
            showOrderConfirmation(orderTotal);

            setTimeout(() => {
                cart = [];
                appliedPromo = null;
                promoDiscountValue = 0;
                promoDiscountType = null;
                saveCart();
                renderCheckoutView();
                updateCartCount();
                if (orderForm) orderForm.reset();
                const promoInput = document.getElementById('promoInput');
                if (promoInput) promoInput.value = '';
                const promoMsg = document.getElementById('promoMsg');
                if (promoMsg) promoMsg.textContent = '';
                hideOrderConfirmation();
            }, 4000);
        });
    }

    // modalBuyNow in cart.html/modal variant
    const modalBuyNow = document.getElementById('modalBuyNowBtn');
    if (modalBuyNow) {
        modalBuyNow.addEventListener('click', function () {
            // mimic card payment
            const orderTotal = getDiscountedTotal();
            const modalOrderForm = document.getElementById('modalOrderForm');
            if (modalOrderForm) modalOrderForm.reset();
            hideCheckoutModal();
            showOrderConfirmation(orderTotal);
            setTimeout(() => {
                cart = [];
                appliedPromo = null;
                promoDiscountValue = 0;
                promoDiscountType = null;
                saveCart();
                renderCheckoutView();
                updateCartCount();
                hideOrderConfirmation();
                const mPromo = document.getElementById('modal_promo_code');
                if (mPromo) mPromo.value = '';
            }, 3000);
        });
    }

    // Order confirmation modal close handlers
    const orderConfirmationClose = document.getElementById('orderConfirmationModalCloseBtn');
    const orderConfirmationBg = document.getElementById('orderConfirmationModalBg');
    if (orderConfirmationClose) orderConfirmationClose.addEventListener('click', hideOrderConfirmation);
    if (orderConfirmationBg) orderConfirmationBg.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) hideOrderConfirmation();
    });

    // Wire up payment selects found on the page so UI is reactive immediately
    const allPaymentSelects = document.querySelectorAll('#paymentSelect, #modal_paymentSelect, select.payment-select');
    allPaymentSelects.forEach(sel => sel.addEventListener('change', togglePaymentButtons));

    // Make sure buttons reflect current payment selection on load
    fetchAndDisplayDiscountInfo();
    setInterval(fetchAndDisplayDiscountInfo, 30000); // real-time offer update
    loadHomepageSections();
    updateCartCount();
    togglePaymentButtons();

    // --- Hero Audio Player Logic ---
    try {
        const heroAudio = document.getElementById('heroAudio');
        const muteBtn = document.getElementById('heroAudioMuteBtn');
        const muteIcon = document.getElementById('heroAudioMuteIcon');

        function updateMuteIcon() {
            if (!muteIcon || !heroAudio) return;
            muteIcon.textContent = heroAudio.muted ? '🔇' : '🔊';
        }

        if (muteBtn && heroAudio) {
            muteBtn.addEventListener('click', function () {
                heroAudio.muted = !heroAudio.muted;
                updateMuteIcon();
            });
            updateMuteIcon();
        }
    } catch (err) {
        console.warn('Hero audio init failed', err);
    }
});