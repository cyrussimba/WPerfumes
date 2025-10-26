// static/js/price_comparison.js
// Frontend for comparison page that expects the server API to return admin-driven
// comparisons (fields: name, product_id, our_price, competitor_price).
const API = "/api";

async function fetchProducts() {
    const sel = document.getElementById('pcProductSelect');
    sel.innerHTML = '<option value="">Loading…</option>';
    try {
        const res = await fetch(`${API}/products`);
        if (!res.ok) throw new Error('Failed to load products');
        const products = await res.json();
        sel.innerHTML = '<option value="">-- Select product --</option>';
        products.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.title} — ${p.brand} (${p.id}) — ${p.price ? '£' + p.price : 'Price N/A'}`;
            sel.appendChild(opt);
        });
    } catch (e) {
        sel.innerHTML = '<option value="">Failed to load products</option>';
        console.warn('fetchProducts', e);
    }
}

function setStatus(msg, isError = false) {
    const st = document.getElementById('pcStatus');
    st.textContent = msg || '';
    st.style.color = isError ? '#c00' : '';
}

function formatMoney(n) {
    if (n === null || typeof n === 'undefined' || isNaN(n)) return '—';
    try {
        return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(Number(n));
    } catch (e) {
        return '£' + Number(n).toFixed(2);
    }
}

async function runCompare(productId) {
    setStatus('Running comparison — using admin values where present...');
    const resultDiv = document.getElementById('pcResult');
    resultDiv.style.display = 'none';
    try {
        const res = await fetch(`${API}/price-compare?product_id=${encodeURIComponent(productId)}`);
        if (!res.ok) {
            const txt = await res.text();
            setStatus('Comparison failed: ' + txt, true);
            return;
        }
        const js = await res.json();
        renderComparison(js);
    } catch (e) {
        console.error(e);
        setStatus('Network error while comparing prices', true);
    }
}

function renderComparison(data) {
    setStatus('');
    const tbody = document.querySelector('#pcTable tbody');
    tbody.innerHTML = '';
    const titleEl = document.getElementById('pcProductTitle');
    const ourPriceEl = document.getElementById('pcOurPrice');
    const badge = document.getElementById('pcBadge');

    titleEl.textContent = `${data.product.title} — ${data.product.brand} (${data.product.id})`;
    ourPriceEl.textContent = formatMoney(data.product.price);

    const comps = Array.isArray(data.comparisons) ? data.comparisons : [];
    comps.forEach(c => {
        const tr = document.createElement('tr');

        const brandTd = document.createElement('td');
        brandTd.textContent = c.name || 'Unknown';

        const pidTd = document.createElement('td');
        pidTd.textContent = c.product_id || (data.product && data.product.id) || '-';

        const ourTd = document.createElement('td');
        const ourVal = (typeof c.our_price === 'number') ? c.our_price : data.product.price;
        ourTd.textContent = formatMoney(ourVal);

        const compTd = document.createElement('td');
        const compVal = (typeof c.competitor_price === 'number') ? c.competitor_price : (typeof c.manual_price === 'number' ? c.manual_price : c.found_price);
        if (compVal === null || compVal === undefined || isNaN(compVal)) {
            compTd.textContent = c.error ? `Error` : 'N/A';
        } else {
            compTd.textContent = formatMoney(compVal);
        }

        tr.appendChild(brandTd);
        tr.appendChild(pidTd);
        tr.appendChild(ourTd);
        tr.appendChild(compTd);
        tbody.appendChild(tr);
    });

    if (data.ours_is_cheapest) {
        badge.style.display = 'inline-block';
        badge.textContent = 'Cheapest (Great value!)';
    } else {
        badge.style.display = 'none';
    }

    document.getElementById('pcResult').style.display = '';
}

document.addEventListener('DOMContentLoaded', function () {
    fetchProducts();
    document.getElementById('pcCompareBtn').addEventListener('click', function () {
        const sel = document.getElementById('pcProductSelect');
        const pid = sel.value;
        if (!pid) {
            setStatus('Please select a product to compare', true);
            return;
        }
        runCompare(pid);
    });

    const preset = window.PC_PRESET_PRODUCT_ID && window.PC_PRESET_PRODUCT_ID.length ? window.PC_PRESET_PRODUCT_ID : null;
    if (preset) {
        const trySelect = setInterval(() => {
            const sel = document.getElementById('pcProductSelect');
            if (sel && sel.options.length > 1) {
                for (const opt of sel.options) {
                    if (opt.value === preset) {
                        opt.selected = true;
                        clearInterval(trySelect);
                        runCompare(preset);
                        return;
                    }
                }
                clearInterval(trySelect);
            }
        }, 200);
        setTimeout(() => clearInterval(trySelect), 8000);
    }
});