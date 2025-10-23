// app/static/js/paypal.js
// Client helper that renders PayPal Buttons and calls the Flask endpoints.
// Adds a convenience helper initiateCardCheckout(items, opts) to create a PayPal order
// and redirect the buyer to the PayPal approval URL. This makes "Buy Now" buttons
// able to redirect users to PayPal without rendering UI buttons on the page.

async function fetchCartItems() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    return cart.map(i => ({
        id: i.id || i.product_id || '',
        title: i.title || i.name || '',
        unit_price: parseFloat(i.price || 0),
        quantity: parseInt(i.quantity || i.qty || 1, 10),
        currency: i.currency || 'USD'
    }));
}

function renderPayPalButtons(containerSelector, opts = {}) {
    if (!window.paypal) {
        console.error("PayPal SDK not loaded. Add <script src=\"https://www.paypal.com/sdk/js?client-id=YOUR_CLIENT_ID&currency=USD\"></script>");
        return;
    }
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error("PayPal container not found:", containerSelector);
        return;
    }

    paypal.Buttons({
        style: opts.style || { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
        createOrder: async function (data, actions) {
            const items = await fetchCartItems();
            // Call the server endpoint with the /paypal prefix (blueprint is namespaced)
            const res = await fetch('/paypal/create-paypal-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items, currency: opts.currency || 'USD' })
            });
            const js = await res.json().catch(() => null);
            if (!res.ok || !js) {
                alert('Failed to create PayPal order: ' + (js && (js.error || js.detail) ? (js.error + ' - ' + js.detail) : res.statusText));
                throw new Error('create order failed');
            }
            // PayPal expects the order ID
            return js.id;
        },
        onApprove: async function (data, actions) {
            // gather customer fields if present on page
            const customer = {};
            const nameEl = document.querySelector('#customer') || document.querySelector('#modal_customer');
            const emailEl = document.querySelector('#email') || document.querySelector('#modal_email');
            const phoneEl = document.querySelector('#phone') || document.querySelector('#modal_phone');
            const addressEl = document.querySelector('#address') || document.querySelector('#modal_address');
            if (nameEl) customer.name = nameEl.value || '';
            if (emailEl) customer.email = emailEl.value || '';
            if (phoneEl) customer.phone = phoneEl.value || '';
            if (addressEl) customer.address = addressEl.value || '';

            const items = await fetchCartItems();
            const payload = { orderID: data.orderID, customer, items };

            // POST to the capture endpoint (namespaced)
            const res = await fetch('/paypal/capture-paypal-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const js = await res.json().catch(() => null);
            if (!res.ok) {
                console.error('Capture failed', js || res.statusText);
                alert('Payment capture failed. See console for details.');
                return;
            }
            // Clear local cart and redirect to success
            try { localStorage.removeItem('cart'); } catch (e) { /* ignore */ }
            if (opts.successUrl) {
                window.location.href = opts.successUrl;
            } else {
                window.location.href = '/';
            }
        },
        onError: function (err) {
            console.error('PayPal Buttons error', err);
            alert('An error occurred with PayPal: ' + (err && err.message ? err.message : err));
        },
        onCancel: function (data) {
            console.log('PayPal payment cancelled', data);
            // Optionally show a message in page
            alert('Payment cancelled.');
        }
    }).render(containerSelector);
}

// New helper: create a PayPal order on the server and redirect buyer to the approval URL.
// items: array of { id, title, unit_price, quantity, currency? }
// opts: { currency, returnUrl, cancelUrl, brand_name }
async function initiateCardCheckout(items, opts = {}) {
    try {
        const payload = {
            items: items || await fetchCartItems(),
            currency: (opts.currency || 'USD'),
            // default returnUrl points to the namespaced /paypal/return
            return_url: opts.returnUrl || (window.location.origin + '/paypal/return'),
            cancel_url: opts.cancelUrl || (window.location.origin + '/paypal/cancel'),
            brand_name: opts.brand_name || document.title || 'Store'
        };
        // Persist items (and possibly customer) so the /paypal/return page can capture and create orders.
        try { localStorage.setItem('paypal_items', JSON.stringify(payload.items)); } catch (e) { /* ignore */ }

        // Call the server create endpoint with the /paypal prefix
        const res = await fetch('/paypal/create-paypal-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const js = await res.json().catch(() => null);
        if (!res.ok || !js) {
            console.error('create-paypal-order failed', js || res.statusText);
            throw new Error(js && (js.error || js.detail) ? (js.error + ' - ' + js.detail) : 'Failed to create PayPal order');
        }
        // Find approve link
        const links = js.links || [];
        const approve = links.find(l => l.rel === 'approve');
        if (!approve || !approve.href) {
            console.error('No approve link returned by PayPal', js);
            throw new Error('PayPal did not return an approval URL');
        }
        // Redirect buyer to PayPal approval page
        window.location.href = approve.href;
    } catch (err) {
        console.error('initiateCardCheckout error', err);
        alert('Failed to start card (PayPal) checkout: ' + (err && err.message ? err.message : err));
        throw err;
    }
}

// expose helper to global scope so pages can call it
window.renderPayPalButtons = renderPayPalButtons;
window.initiateCardCheckout = initiateCardCheckout;

// Auto initialize for common container IDs
document.addEventListener('DOMContentLoaded', function () {
    if (document.querySelector('#paypal-button-container')) {
        renderPayPalButtons('#paypal-button-container', { currency: 'USD', successUrl: '/' });
    }
    if (document.querySelector('#modal_paypal_button_container')) {
        renderPayPalButtons('#modal_paypal_button_container', { currency: 'USD', successUrl: '/' });
    }
});