// static/js/admin.js
// Use relative API base so code works in development and when deployed (Render, etc.)
const API = "/api";
const CONTENT_API = "/content-api"; // content backend prefix for stories and content admin

// Helper: normalize returned image paths to usable browser URLs
function toStaticUrl(url) {
    if (!url) return '/static/images/placeholder.jpg';
    if (typeof url !== 'string') return '/static/images/placeholder.jpg';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return url;
    // backend might return 'images/brand/img.jpg' -> prefix with /static/
    return `/static/${url}`;
}

// Unified fetch wrapper that ensures session cookie is included and sets JSON headers for object bodies.
// url: full URL string (e.g. `${API}/brands`), opts: same shape as fetch options.
async function apiFetch(url, opts = {}) {
    opts = Object.assign({}, opts);
    // Ensure credentials are included so the browser sends cookies
    opts.credentials = opts.credentials || 'include';

    // If body is a plain object (not a string), stringify and set header
    if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
        opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        opts.body = JSON.stringify(opts.body);
    } else if (opts.body && typeof opts.body === 'string') {
        // If caller passed a string and no Content-Type was provided, set JSON header
        opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    }

    return fetch(url, opts);
}

// --- UI wiring ---
let user = null;
if (document.getElementById('tabBrands')) document.getElementById('tabBrands').onclick = () => switchTab('brands');
if (document.getElementById('tabProducts')) document.getElementById('tabProducts').onclick = () => switchTab('products');
if (document.getElementById('tabHomepage')) document.getElementById('tabHomepage').onclick = () => switchTab('homepage');
if (document.getElementById('tabTopPicks')) document.getElementById('tabTopPicks').onclick = () => switchTab('topPicks');
if (document.getElementById('tabCoupons')) document.getElementById('tabCoupons').onclick = () => switchTab('coupons');
if (document.getElementById('tabOrders')) document.getElementById('tabOrders').onclick = () => switchTab('orders');

function switchTab(tab) {
    const tabs = ['brands', 'products', 'homepage', 'topPicks', 'coupons', 'orders'];
    tabs.forEach(t => {
        const el = document.getElementById('tab' + (t.charAt(0).toUpperCase() + t.slice(1)));
        if (el) el.classList.toggle('active', t === tab);
    });
    const cards = { brands: 'brandsCard', products: 'productsCard', homepage: 'homepageCard', topPicks: 'topPicksCard', coupons: 'couponsCard', orders: 'ordersCard' };
    Object.entries(cards).forEach(([k, v]) => {
        const el = document.getElementById(v);
        if (el) el.style.display = (k === tab) ? '' : 'none';
    });

    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl) {
        pageTitleEl.textContent =
            tab === 'brands' ? 'Brands' :
                tab === 'products' ? 'Products' :
                    tab === 'homepage' ? 'Homepage Products' :
                        tab === 'topPicks' ? 'Top Picks' :
                            tab === 'coupons' ? 'Promotions' :
                                tab === 'orders' ? 'Customer Orders' : '';
    }
    if (tab === 'brands') loadBrands();
    else if (tab === 'products') loadProducts();
    else if (tab === 'homepage') loadHomepageProducts();
    else if (tab === 'topPicks') loadTopPicks();
    else if (tab === 'coupons') loadCoupons();
    else if (tab === 'orders') loadOrders();
}

// ---------- Login handler ----------
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').onsubmit = async e => {
        e.preventDefault();
        const username = document.getElementById('username').value, password = document.getElementById('password').value;
        const loginErrorEl = document.getElementById('loginError');
        if (loginErrorEl) loginErrorEl.style.display = 'none';
        try {
            const res = await apiFetch(`${API}/auth/login`, {
                method: "POST",
                body: { username, password }
            });

            console.log('Login response status:', res.status);
            const bodyText = await res.text().catch(() => '');
            console.log('Login response body:', bodyText);

            if (!res.ok) {
                if (loginErrorEl) {
                    loginErrorEl.textContent = `Login failed (${res.status}): ${bodyText || res.statusText}`;
                    loginErrorEl.style.display = 'block';
                }
                alert('Login failed: ' + (bodyText || res.statusText));
                return;
            }

            let json = null;
            try { json = JSON.parse(bodyText); } catch (err) { json = null; }
            user = json && json.user ? json.user : null;
            const loginBg = document.getElementById('loginBg');
            if (loginBg) loginBg.style.display = 'none';
            const userInfo = document.getElementById('userInfo');
            if (userInfo) userInfo.style.display = '';
            const usernameInfo = document.getElementById('usernameInfo');
            if (usernameInfo) usernameInfo.textContent = user ? user.username : username;
            switchTab('brands');
        } catch (err) {
            console.error('Network/login error', err);
            if (loginErrorEl) {
                loginErrorEl.textContent = 'Network error: ' + err.message;
                loginErrorEl.style.display = 'block';
            } else {
                alert('Network error during login: ' + err.message);
            }
        }
    };
}
// -----------------------------------------------------------------------------------------

if (document.getElementById('logoutBtn')) {
    document.getElementById('logoutBtn').onclick = async () => {
        try {
            await apiFetch(`${API}/auth/logout`, { method: "POST" });
        } catch (e) { /* ignore */ }
        location.reload();
    };
}

// ----------- Site Settings Discount JS -----------
async function loadDiscountSetting() {
    try {
        const r = await apiFetch(`${API}/settings/checkout_discount`);
        if (!r.ok) return;
        const js = await r.json();
        const el = document.getElementById('checkout_discount_percent');
        if (el) el.value = js.percent ?? 0;
    } catch (err) {
        console.warn('Failed to load discount setting', err);
    }
}
if (document.getElementById('discountSettingForm')) {
    document.getElementById('discountSettingForm').onsubmit = async function (e) {
        e.preventDefault();
        const percent = parseFloat(document.getElementById('checkout_discount_percent').value || 0);
        const msg = document.getElementById('discountSaveMsg');
        if (msg) msg.textContent = "Saving...";
        try {
            const r = await apiFetch(`${API}/settings/checkout_discount`, {
                method: "PUT",
                body: { percent }
            });
            if (r.ok) {
                if (msg) msg.textContent = "Saved!";
            } else {
                if (msg) msg.textContent = "Failed!";
            }
        } catch {
            if (msg) msg.textContent = "Failed!";
        }
        setTimeout(() => { if (msg) msg.textContent = ""; }, 1800);
    };
    loadDiscountSetting();
}

// ----------- Brands -----------
async function loadBrands() {
    try {
        const res = await apiFetch(`${API}/brands`);
        if (!res.ok) return;
        const brands = await res.json();
        const tbody = document.querySelector('#brandsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        brands.forEach(b => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${b.name}</td>
                <td><img src="${toStaticUrl(b.logo)}" alt="Logo" style="height:36px;border-radius:4px;"></td>
                <td>${b.description || ""}</td>
                <td class="action">
                    <button class="btn small accent" onclick="editBrand('${(b.name || '').replace(/'/g, "\\'")}')"><span class="material-icons">edit</span></button>
                    <button class="btn small danger" onclick="deleteBrand('${(b.name || '').replace(/'/g, "\\'")}')"><span class="material-icons">delete</span></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.warn('loadBrands error', err);
    }
}
if (document.getElementById('addBrandBtn')) {
    document.getElementById('addBrandBtn').onclick = () => showBrandModal();
}
window.editBrand = function (name) {
    apiFetch(`${API}/brands`).then(res => res.json()).then(brands => {
        const brand = brands.find(b => b.name === name);
        showBrandModal(brand);
    }).catch(err => console.warn(err));
};
function showBrandModal(brand) {
    const modalBg = document.getElementById('modalBg');
    const modalContent = document.getElementById('modalContent');
    if (!modalBg || !modalContent) return;
    modalBg.style.display = 'flex';
    modalContent.innerHTML = `
            <h3>${brand ? "Edit" : "Add"} Brand</h3>
            <form id="brandForm">
                <label>Name</label>
                <input name="name" required value="${brand ? brand.name : ""}" ${brand ? 'readonly' : ''}>
                <label>Logo URL</label>
                <input name="logo" required value="${brand ? brand.logo : ""}">
                <label>Description</label>
                <textarea name="description" rows="2">${brand ? brand.description || "" : ""}</textarea>
                <div class="modal-actions">
                    <button type="submit" class="btn">${brand ? "Save" : "Add"}</button>
                    <button type="button" class="btn accent" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        `;
    const brandForm = document.getElementById('brandForm');
    brandForm.onsubmit = async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        try {
            let res;
            if (!brand) {
                res = await apiFetch(`${API}/brands`, { method: "POST", body: data });
            } else {
                res = await apiFetch(`${API}/brands/${encodeURIComponent(brand.name)}`, { method: "PUT", body: data });
            }
            if (!res.ok) {
                const err = await res.text();
                alert('Save failed: ' + err);
            }
        } catch (e) {
            alert('Network error: ' + e.message);
        }
        closeModal();
        loadBrands();
    };
}
window.deleteBrand = async function (name) {
    if (confirm("Delete brand " + name + "?")) {
        try {
            await apiFetch(`${API}/brands/${encodeURIComponent(name)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadBrands();
    }
};

// ----------- Products -----------
async function loadProducts() {
    try {
        const res = await apiFetch(`${API}/products`);
        if (!res.ok) return;
        const products = await res.json();
        const tbody = document.querySelector('#productsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        products.forEach(p => {
            let thumbnailImgs = '';
            if (p.thumbnails) {
                let thumbs = p.thumbnails.split(',').map(s => s.trim()).filter(s => s);
                thumbs.slice(0, 3).forEach(url => {
                    thumbnailImgs += `<img src="${toStaticUrl(url)}" alt="Thumb" style="height:32px;border-radius:4px;margin-right:3px;margin-bottom:2px;background:#f0f0f0;border:1px solid #eee;">`;
                });
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.title}</td>
                <td>${p.brand}</td>
                <td>$${parseFloat(p.price).toFixed(2)}</td>
                <td>${p.status || ""}</td>
                <td>${typeof p.quantity === 'number' ? p.quantity : 0}</td>
                <td>${p.tags || ""}</td>
                <td><img src="${toStaticUrl(p.image_url)}" alt="Main Img" style="height:36px;border-radius:4px;"></td>
                <td>${thumbnailImgs}</td>
                <td class="action">
                    <button class="btn small accent" onclick="editProduct('${(p.id || '').replace(/'/g, "\\'")}')"><span class="material-icons">edit</span></button>
                    <button class="btn small danger" onclick="deleteProduct('${(p.id || '').replace(/'/g, "\\'")}')"><span class="material-icons">delete</span></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.warn('loadProducts error', err);
    }
}
if (document.getElementById('addProductBtn')) {
    document.getElementById('addProductBtn').onclick = () => showProductModal();
}
window.editProduct = function (id) {
    apiFetch(`${API}/products`).then(res => res.json()).then(products => {
        const p = products.find(x => x.id === id);
        showProductModal(p);
    }).catch(err => console.warn(err));
};
function showProductModal(product) {
    apiFetch(`${API}/brands`).then(res => res.json()).then(brands => {
        const modalBg = document.getElementById('modalBg');
        const modalContent = document.getElementById('modalContent');
        if (!modalBg || !modalContent) return;
        modalBg.style.display = 'flex';
        modalContent.innerHTML = `
                <h3>${product ? "Edit" : "Add"} Product</h3>
                <form id="productForm">
                    <label>Title</label>
                    <input name="title" required value="${product ? product.title : ""}">
                    <label>Brand</label>
                    <select name="brand" required>
                        ${brands.map(b => `<option value="${b.name}" ${product && product.brand == b.name ? "selected" : ""}>${b.name}</option>`).join('')}
                    </select>
                    <label>Price (USD)</label>
                    <input name="price" required type="number" step="0.01" min="0.01" value="${product ? product.price : ""}">
                    <label>Status</label>
                    <select name="status">
                        <option value="restocked" ${product && product.status == "restocked" ? "selected" : ""}>Restocked</option>
                        <option value="new-arrivals" ${product && product.status == "new-arrivals" ? "selected" : ""}>New Arrivals</option>
                        <option value="running-out" ${product && product.status == "running-out" ? "selected" : ""}>Running Out</option>
                        <option value="few-remaining" ${product && product.status == "few-remaining" ? "selected" : ""}>Few Remaining</option>
                        <option value="selling-fast" ${product && product.status == "selling-fast" ? "selected" : ""}>Selling Fast</option>
                        <option value="almost-gone" ${product && product.status == "almost-gone" ? "selected" : ""}>Almost Gone</option>
                        <option value="out-of-stock" ${product && product.status == "out-of-stock" ? "selected" : ""}>Out of Stock</option>
                    </select>
                    <label>Inventory Quantity</label>
                    <input name="quantity" type="number" min="0" required value="${product && typeof product.quantity === 'number' ? product.quantity : 10}">
                    <label>Main Image URL</label>
                    <input name="image_url" required value="${product ? product.image_url : ""}">
                    <label>Thumbnail URLs (comma separated)</label>
                    <input name="thumbnails" value="${product && product.thumbnails ? product.thumbnails : ""}">
                    <label>Description</label>
                    <textarea name="description" rows="2">${product ? product.description || "" : ""}</textarea>
                    <label>Key Notes (comma separated)</label>
                    <input name="keyNotes" value="${product ? (product.keyNotes || []).join(', ') : ""}">
                    <label>Tags (comma separated, e.g. gym, masculine, fruity)</label>
                    <input name="tags" value="${product ? product.tags || '' : ''}">
                    <div class="modal-actions">
                        <button type="submit" class="btn">${product ? "Save" : "Add"}</button>
                        <button type="button" class="btn accent" onclick="closeModal()">Cancel</button>
                    </div>
                </form>
            `;
        document.getElementById('productForm').onsubmit = async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            try {
                let res;
                if (product) {
                    data.id = product.id;
                    data.quantity = parseInt(data.quantity, 10) || 0;
                    data.tags = data.tags || '';
                    data.thumbnails = data.thumbnails || '';
                    res = await apiFetch(`${API}/products/${encodeURIComponent(product.id)}`, { method: "PUT", body: data });
                } else {
                    data.id = 'PRD' + Math.floor(Date.now() / 10000).toString().slice(-4) + Math.floor(Math.random() * 99).toString().padStart(2, '0');
                    data.quantity = parseInt(data.quantity, 10) || 0;
                    data.tags = data.tags || '';
                    data.thumbnails = data.thumbnails || '';
                    res = await apiFetch(`${API}/products`, { method: "POST", body: data });
                }
                if (!res.ok) {
                    const err = await res.text();
                    alert('Save failed: ' + err);
                }
            } catch (e) {
                alert('Network error: ' + e.message);
            }
            closeModal();
            loadProducts();
        };
    }).catch(err => console.warn(err));
}
window.deleteProduct = async function (id) {
    if (confirm("Delete this product?")) {
        try {
            await apiFetch(`${API}/products/${encodeURIComponent(id)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadProducts();
    }
};

// ----------- Homepage Products -----------
async function loadHomepageProducts() {
    try {
        const res = await apiFetch(`${API}/homepage-products`);
        if (!res.ok) return;
        const all = await res.json();
        let allRows = [];
        for (const section in all) {
            for (const item of all[section]) {
                allRows.push(item);
            }
        }
        const tbody = document.querySelector('#homepageTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        allRows.forEach(hp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                    <td>${hp.section}</td>
                    <td>${hp.title}</td>
                    <td>${hp.brand}</td>
                    <td>$${hp.price}</td>
                    <td>${hp.sort_order}</td>
                    <td>${hp.visible ? "Yes" : "No"}</td>
                    <td class="action">
                        <button class="btn small accent" onclick="editHomepageProduct(${hp.homepage_id})">Edit</button>
                        <button class="btn small danger" onclick="deleteHomepageProduct(${hp.homepage_id})">Delete</button>
                    </td>`;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.warn('loadHomepageProducts error', err);
    }
}
if (document.getElementById('addHomepageBtn')) {
    document.getElementById('addHomepageBtn').onclick = () => showHomepageModal();
}
window.editHomepageProduct = function (homepage_id) {
    apiFetch(`${API}/homepage-products`).then(res => res.json()).then(all => {
        let found;
        for (const section in all) {
            found = all[section].find(hp => hp.homepage_id == homepage_id);
            if (found) break;
        }
        showHomepageModal(found, homepage_id);
    }).catch(err => console.warn(err));
};
function showHomepageModal(hp, homepage_id) {
    apiFetch(`${API}/products`).then(res => res.json()).then(products => {
        const modalBg = document.getElementById('modalBg');
        const modalContent = document.getElementById('modalContent');
        if (!modalBg || !modalContent) return;
        modalBg.style.display = 'flex';
        modalContent.innerHTML = `
                    <h3>${hp ? "Edit" : "Add"} Homepage Product</h3>
                    <form id="homepageForm">
                        <label>Section</label>
                        <select name="section" required>
                            <option value="signature" ${hp && hp.section == "signature" ? "selected" : ""}>Signature Perfumes</option>
                            <option value="men" ${hp && hp.section == "men" ? "selected" : ""}>Men's Brands</option>
                            <option value="women" ${hp && hp.section == "women" ? "selected" : ""}>Women's Brands</option>
                            <option value="offers" ${hp && hp.section == "offers" ? "selected" : ""}>Hot Offers</option>
                        </select>
                        <label>Product</label>
                        <select name="product_id" required>
                            ${products.map(p => `<option value="${p.id}" ${hp && hp.id == p.id ? "selected" : ""}>${p.title} (${p.brand})</option>`).join('')}
                        </select>
                        <label>Sort Order</label>
                        <input name="sort_order" type="number" value="${hp ? hp.sort_order : 0}">
                        <label>Visible</label>
                        <select name="visible">
                            <option value="true" ${hp && hp.visible ? "selected" : ""}>Yes</option>
                            <option value="false" ${hp && !hp.visible ? "selected" : ""}>No</option>
                        </select>
                        <div class="modal-actions">
                            <button type="submit" class="btn">${hp ? "Save" : "Add"}</button>
                            <button type="button" class="btn accent" onclick="closeModal()">Cancel</button>
                        </div>
                    </form>
                `;
        document.getElementById('homepageForm').onsubmit = async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            data.sort_order = parseInt(data.sort_order, 10) || 0;
            data.visible = data.visible === "true";
            try {
                if (!hp) {
                    await apiFetch(`${API}/homepage-products`, { method: "POST", body: data });
                } else {
                    await apiFetch(`${API}/homepage-products/${encodeURIComponent(homepage_id)}`, { method: "PUT", body: data });
                }
            } catch (err) {
                console.warn(err);
            }
            closeModal();
            loadHomepageProducts();
        };
    }).catch(err => console.warn(err));
}
window.deleteHomepageProduct = async function (homepage_id) {
    if (confirm("Delete homepage product?")) {
        try {
            await apiFetch(`${API}/homepage-products/${encodeURIComponent(homepage_id)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadHomepageProducts();
    }
};

// ----------- Top Picks -----------
async function loadTopPicks() {
    try {
        const res = await apiFetch(`${API}/top-picks`);
        if (!res.ok) return;
        const topPicks = await res.json();
        const tbody = document.querySelector('#topPicksTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        topPicks.forEach(tp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                    <td>${tp.product_title}</td>
                    <td>${tp.brand}</td>
                    <td>${tp.rank}</td>
                    <td>${tp.tags ? (Array.isArray(tp.tags) ? tp.tags.join(', ') : tp.tags) : ''}</td>
                    <td>${tp.sales_count ? tp.sales_count : '-'}</td>
                    <td class="action">
                        <button class="btn small accent" onclick="editTopPick('${(tp.id || '').replace(/'/g, "\\'")}')"><span class="material-icons">edit</span></button>
                        <button class="btn small danger" onclick="deleteTopPick('${(tp.id || '').replace(/'/g, "\\'")}')"><span class="material-icons">delete</span></button>
                        <button class="btn small" onclick="pushTopPick('${(tp.id || '').replace(/'/g, "\\'")}')"><span class="material-icons">publish</span></button>
                    </td>
                `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.warn('loadTopPicks error', err);
    }
}
if (document.getElementById('addTopPickBtn')) {
    document.getElementById('addTopPickBtn').onclick = () => showTopPickModal();
}
window.editTopPick = function (id) {
    apiFetch(`${API}/top-picks`).then(res => res.json()).then(topPicks => {
        const tp = topPicks.find(x => x.id === id);
        showTopPickModal(tp);
    }).catch(err => console.warn(err));
};
function showTopPickModal(tp) {
    apiFetch(`${API}/products`).then(res => res.json()).then(products => {
        const modalBg = document.getElementById('modalBg');
        const modalContent = document.getElementById('modalContent');
        if (!modalBg || !modalContent) return;
        modalBg.style.display = 'flex';
        modalContent.innerHTML = `
                    <h3>${tp ? "Edit" : "Add"} Top Pick</h3>
                    <form id="topPickForm">
                        <label>Product</label>
                        <select name="product_id" required>
                            ${products.map(p => `<option value="${p.id}" ${tp && tp.product_id == p.id ? "selected" : ""}>${p.title} (${p.brand})</option>`).join('')}
                        </select>
                        <label>Rank</label>
                        <input name="rank" type="number" min="1" max="100" required value="${tp ? tp.rank : ''}">
                        <label>Tags (comma separated: men, women, gym, ceo, celeb, etc.)</label>
                        <input name="tags" value="${tp && tp.tags ? (Array.isArray(tp.tags) ? tp.tags.join(', ') : tp.tags) : ''}">
                        <label>Sales (auto-calculated)</label>
                        <input name="sales_count" type="number" value="${tp ? tp.sales_count : ''}" readonly>
                        <div class="modal-actions">
                            <button type="submit" class="btn">${tp ? "Save" : "Add"}</button>
                            <button type="button" class="btn accent" onclick="closeModal()">Cancel</button>
                        </div>
                    </form>
                `;
        document.getElementById('topPickForm').onsubmit = async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            data.tags = data.tags ? data.tags.split(',').map(t => t.trim()).filter(t => t) : [];
            data.rank = parseInt(data.rank, 10);
            try {
                if (!tp) {
                    const createRes = await apiFetch(`${API}/top-picks`, { method: "POST", body: data });
                    if (!createRes.ok) {
                        const err = await createRes.text();
                        alert('Save failed: ' + err);
                    } else {
                        let createdObj = null;
                        try { createdObj = await createRes.json(); } catch (jsonErr) { console.warn(jsonErr); }
                        if (createdObj && createdObj.id) {
                            try {
                                await apiFetch(`${API}/top-picks/${encodeURIComponent(createdObj.id)}/push`, { method: "POST" });
                                console.log('Top Pick created and pushed:', createdObj.id);
                            } catch (pushErr) {
                                console.warn('Top Pick created but automatic push failed', pushErr);
                            }
                        } else {
                            console.log('Top Pick created; if it does not appear on the frontend, use the Publish button in Top Picks list to push it.');
                        }
                    }
                } else {
                    const res = await apiFetch(`${API}/top-picks/${encodeURIComponent(tp.id)}`, { method: "PUT", body: data });
                    if (!res.ok) {
                        const err = await res.text();
                        alert('Save failed: ' + err);
                    }
                }
            } catch (err) {
                console.warn(err);
                alert('Network error: ' + err.message);
            }
            closeModal();
            loadTopPicks();
        };
    }).catch(err => console.warn(err));
}
window.deleteTopPick = async function (id) {
    if (confirm("Delete this Top Pick?")) {
        try {
            await apiFetch(`${API}/top-picks/${encodeURIComponent(id)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadTopPicks();
    }
};
window.pushTopPick = async function (id) {
    try {
        await apiFetch(`${API}/top-picks/${encodeURIComponent(id)}/push`, { method: "POST" });
        alert("Top Pick pushed to front end!");
    } catch (e) {
        alert("Failed to push Top Pick.");
    }
};

// ----------- Promotions -----------
async function loadCoupons() {
    try {
        const res = await apiFetch(`${API}/coupons`);
        if (!res.ok) return;
        const promos = await res.json();
        const tbody = document.querySelector('#couponsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        promos.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                    <td>${c.code}</td>
                    <td>${c.description || ""}</td>
                    <td>${c.discount_type}</td>
                    <td>${c.discount_value}</td>
                    <td>${c.start_date}</td>
                    <td>${c.end_date}</td>
                    <td>${c.active ? "Yes" : "No"}</td>
                    <td class="action">
                        <button class="btn small accent" onclick="editCoupon('${(c.code || '').replace(/'/g, "\\'")}')"><span class="material-icons">edit</span></button>
                        <button class="btn small danger" onclick="deleteCoupon('${(c.code || '').replace(/'/g, "\\'")}')"><span class="material-icons">delete</span></button>
                    </td>
                `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.warn('loadCoupons error', err);
    }
}
if (document.getElementById('addCouponBtn')) {
    document.getElementById('addCouponBtn').onclick = () => showCouponModal();
}
window.editCoupon = function (code) {
    apiFetch(`${API}/coupons`).then(res => res.json()).then(promos => {
        const promo = promos.find(c => c.code === code);
        showCouponModal(promo);
    }).catch(err => console.warn(err));
};
function showCouponModal(promo) {
    const modalBg = document.getElementById('modalBg');
    const modalContent = document.getElementById('modalContent');
    if (!modalBg || !modalContent) return;
    modalBg.style.display = 'flex';
    modalContent.innerHTML = `
                <h3>${promo ? "Edit" : "Add"} Promotion</h3>
                <form id="couponForm">
                    <label>Promo Code</label>
                    <input name="code" required value="${promo ? promo.code : ""}" ${promo ? 'readonly' : ''}>
                    <label>Description</label>
                    <textarea name="description" rows="2">${promo ? promo.description || "" : ""}</textarea>
                    <label>Discount Type</label>
                    <select name="discount_type">
                        <option value="percent" ${promo && promo.discount_type === "percent" ? "selected" : ""}>Percent (%)</option>
                        <option value="fixed" ${promo && promo.discount_type === "fixed" ? "selected" : ""}>Fixed Amount</option>
                    </select>
                    <label>Discount Value</label>
                    <input name="discount_value" type="number" step="0.01" min="0" required value="${promo ? promo.discount_value : ""}">
                    <label>Start Date</label>
                    <input name="start_date" type="date" required value="${promo ? promo.start_date : ""}">
                    <label>End Date</label>
                    <input name="end_date" type="date" required value="${promo ? promo.end_date : ""}">
                    <label>Active</label>
                    <select name="active">
                        <option value="true" ${promo && promo.active ? "selected" : ""}>Yes</option>
                        <option value="false" ${promo && !promo.active ? "selected" : ""}>No</option>
                    </select>
                    <div class="modal-actions">
                        <button type="submit" class="btn">${promo ? "Save" : "Add"}</button>
                        <button type="button" class="btn accent" onclick="closeModal()">Cancel</button>
                    </div>
                </form>
            `;
    document.getElementById('couponForm').onsubmit = async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        data.discount_value = parseFloat(data.discount_value);
        data.active = data.active === "true";
        try {
            if (!promo) {
                await apiFetch(`${API}/coupons`, { method: "POST", body: data });
            } else {
                await apiFetch(`${API}/coupons/${encodeURIComponent(promo.code)}`, { method: "PUT", body: data });
            }
        } catch (err) {
            console.warn(err);
        }
        closeModal();
        loadCoupons();
    };
}
window.deleteCoupon = async function (code) {
    if (confirm("Delete promo code " + code + "?")) {
        try {
            await apiFetch(`${API}/coupons/${encodeURIComponent(code)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadCoupons();
    }
};

// ----------- Orders -----------
async function loadOrders() {
    try {
        const res = await apiFetch(`${API}/orders`);
        if (!res.ok) return;
        const orders = await res.json();
        const tbody = document.querySelector('#ordersTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        orders.forEach(o => {
            let statusClass = "";
            if (o.status === "Delivered") statusClass = "order-delivered";
            else if (o.status === "Cancelled") statusClass = "order-cancelled";
            else if (o.status === "Processing") statusClass = "order-processing";
            else if (o.status === "Shipped") statusClass = "order-shipped";
            else statusClass = "order-pending";
            const tr = document.createElement('tr');
            tr.innerHTML = `
                    <td>${o.customer_name}</td>
                    <td>${o.customer_email}</td>
                    <td>${o.customer_phone}</td>
                    <td>${o.customer_address}</td>
                    <td>${o.product_title}</td>
                    <td>${o.quantity}</td>
                    <td><span class="${statusClass}">${o.status}</span></td>
                    <td>${o.payment_method || "Cash on Delivery"}</td>
                    <td>${o.date}</td>
                    <td class="action">
                        <button class="btn small accent" onclick="editOrder(${o.id})"><span class="material-icons">edit</span></button>
                        <button class="btn small danger" onclick="deleteOrder(${o.id})"><span class="material-icons">delete</span></button>
                    </td>
                `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.warn('loadOrders error', err);
    }
}
if (document.getElementById('addOrderBtn')) {
    document.getElementById('addOrderBtn').onclick = () => showOrderModal();
}
window.editOrder = function (id) {
    apiFetch(`${API}/orders`).then(res => res.json()).then(orders => {
        const order = orders.find(o => o.id == id);
        showOrderModal(order);
    }).catch(err => console.warn(err));
};
function showOrderModal(order) {
    apiFetch(`${API}/products`).then(res => res.json()).then(products => {
        apiFetch(`${API}/coupons`).then(res => res.json()).then(promos => {
            const modalBg = document.getElementById('modalBg');
            const modalContent = document.getElementById('modalContent');
            if (!modalBg || !modalContent) return;
            modalBg.style.display = 'flex';
            modalContent.innerHTML = `
                        <h3>${order ? "Edit" : "Add"} Order</h3>
                        <form id="orderForm">
                            <label>Customer Name</label>
                            <input name="customer_name" required value="${order ? order.customer_name : ""}">
                            <label>Customer Email</label>
                            <input name="customer_email" type="email" required value="${order ? order.customer_email : ""}">
                            <label>Customer Phone</label>
                            <input name="customer_phone" required value="${order ? order.customer_phone : ""}">
                            <label>Customer Address</label>
                            <textarea name="customer_address" required rows="2">${order ? order.customer_address : ""}</textarea>
                            <label>Product</label>
                            <select name="product_id" required>
                                ${products.map(p => `<option value="${p.id}" ${order && order.product_id == p.id ? "selected" : ""}>${p.title}</option>`).join('')}
                            </select>
                            <label>Quantity</label>
                            <input name="quantity" type="number" min="1" required value="${order ? order.quantity : 1}">
                            <label>Status</label>
                            <select name="status">
                                <option value="Pending" ${order && order.status == "Pending" ? "selected" : ""}>Pending</option>
                                <option value="Processing" ${order && order.status == "Processing" ? "selected" : ""}>Processing</option>
                                <option value="Shipped" ${order && order.status == "Shipped" ? "selected" : ""}>Shipped</option>
                                <option value="Delivered" ${order && order.status == "Delivered" ? "selected" : ""}>Delivered</option>
                                <option value="Cancelled" ${order && order.status == "Cancelled" ? "selected" : ""}>Cancelled</option>
                            </select>
                            <label>Payment Method</label>
                            <select name="payment_method">
                                <option value="Cash on Delivery" ${order && order.payment_method == "Cash on Delivery" ? "selected" : ""}>Cash on Delivery</option>
                                <option value="Card" ${order && order.payment_method == "Card" ? "selected" : ""}>Card</option>
                            </select>
                            <label>Date</label>
                            <input name="date" type="datetime-local" value="${order && order.date ? order.date.replace(' ', 'T').slice(0, 16) : new Date().toISOString().slice(0, 16)}">
                            <label>Promo Code (choose one)</label>
                            <select name="promo_code">
                                <option value="">None</option>
                                ${promos.filter(p => p.active).map(p =>
                `<option value="${p.code}" ${(order && order.promo_code == p.code) ? "selected" : ""}>${p.code} (${p.description})</option>`
            ).join('')}
                            </select>
                            <div class="modal-actions">
                                <button type="submit" class="btn">${order ? "Save" : "Add"}</button>
                                <button type="button" class="btn accent" onclick="closeModal()">Cancel</button>
                            </div>
                        </form>
                    `;
            document.getElementById('orderForm').onsubmit = async e => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.target).entries());
                const selectedProduct = products.find(p => p.id == data.product_id);
                data.product_title = selectedProduct ? selectedProduct.title : "";
                if (!data.date) {
                    data.date = new Date().toISOString().slice(0, 16).replace("T", " ");
                } else {
                    data.date = data.date.replace("T", " ");
                }
                try {
                    if (order) {
                        await apiFetch(`${API}/orders/${encodeURIComponent(order.id)}`, { method: "PUT", body: data });
                    } else {
                        await apiFetch(`${API}/orders`, { method: "POST", body: data });
                    }
                } catch (err) {
                    console.warn(err);
                }
                closeModal();
                loadOrders();
            };
        }).catch(err => console.warn(err));
    }).catch(err => console.warn(err));
}
window.deleteOrder = async function (order_id) {
    if (confirm("Delete order?")) {
        try {
            await apiFetch(`${API}/orders/${encodeURIComponent(order_id)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadOrders();
    }
}

// Modal helpers
function closeModal() { const mb = document.getElementById('modalBg'); if (mb) mb.style.display = 'none'; }
if (document.getElementById('modalBg')) {
    document.getElementById('modalBg').onclick = function (e) {
        if (e.target === this) closeModal();
    };
}
switchTab('brands');

// -------------------------------
// Content Admin / Stories Section
// (Quill WYSIWYG, inline image insertion, featured-image upload,
//  admin list with search/pagination, drag reorder and save-order, publish/save flows)
// -------------------------------

(function () {
    // Elements (may not exist if content admin UI not present)
    const storiesListEl = document.getElementById('storiesList');
    const titleEl = document.getElementById('title');
    const slugEl = document.getElementById('slug');
    const btnGenSlugEl = document.getElementById('btnGenSlug');
    const sectionEl = document.getElementById('section');
    const excerptEl = document.getElementById('excerpt');
    const authorEl = document.getElementById('author');
    const imageFileEl = document.getElementById('imageFile');
    const uploadedPreviewEl = document.getElementById('uploadedPreview');
    const btnClearImageEl = document.getElementById('btnClearImage');
    const saveBtnEl = document.getElementById('saveBtn');
    const publishBtnEl = document.getElementById('btnPublish');
    const cancelBtnEl = document.getElementById('btnCancel');
    const newBtnEl = document.getElementById('btnNew');
    const refreshBtnEl = document.getElementById('btnRefresh');
    const saveOrderBtnEl = document.getElementById('btnSaveOrder');
    const searchInputEl = document.getElementById('searchInput');
    const prevPageBtnEl = document.getElementById('btnPrevPage');
    const nextPageBtnEl = document.getElementById('btnNextPage');
    const saveStatusEl = document.getElementById('saveStatus');
    const adminErrorEl = document.getElementById('adminError');
    const editingIdInputEl = document.getElementById('editingId');
    const editorTitleEl = document.getElementById('editorTitle');
    const quillContainer = document.getElementById('quillEditor');
    const bodyHiddenInput = document.getElementById('body_html');
    const storyFormEl = document.getElementById('storyForm');

    if (!quillContainer || !storyFormEl) {
        // content admin not present; nothing to wire
        return;
    }

    // State
    let quill;
    let editingId = null;
    let uploadedImagePath = null;
    let slugTouched = false;
    let currentPage = 1;
    let currentLimit = 20;
    let currentQuery = '';

    function setStatus(msg, ok = true) {
        if (!saveStatusEl) return;
        saveStatusEl.textContent = msg || '';
        saveStatusEl.style.color = ok ? '' : '#b00020';
    }

    function showError(msg) {
        if (!adminErrorEl) {
            alert(msg);
            return;
        }
        adminErrorEl.hidden = false;
        adminErrorEl.textContent = msg;
        setTimeout(() => { adminErrorEl.hidden = true; }, 6000);
    }

    function generateSlug(text) {
        return (text || "").toLowerCase()
            .trim()
            .replace(/[’'"]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    async function extractErrorText(res) {
        try {
            const js = await res.json();
            return js.error || js.detail || JSON.stringify(js);
        } catch (e) {
            try { return await res.text(); } catch (e2) { return res.statusText || 'Error'; }
        }
    }

    // Initialize Quill
    function initQuill() {
        quill = new Quill('#quillEditor', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: [
                        [{ header: [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        ['link', 'image'],
                        ['clean']
                    ],
                    handlers: {
                        image: quillImageHandler
                    }
                }
            }
        });
        quill.on('text-change', () => {
            if (bodyHiddenInput) bodyHiddenInput.value = quill.root.innerHTML;
        });
    }

    // Quill image handler: upload to CONTENT_API admin upload endpoint and insert image
    async function quillImageHandler() {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('image', file);
            try {
                const res = await apiFetch(`${CONTENT_API}/admin/upload-image`, { method: 'POST', body: fd });
                if (!res.ok) {
                    const txt = await extractErrorText(res);
                    alert('Image upload failed: ' + txt);
                    return;
                }
                const js = await res.json();
                const url = js.url || (js.path ? `/static/${js.path}` : null);
                if (url) {
                    const range = quill.getSelection(true);
                    quill.insertEmbed(range.index, 'image', url);
                    quill.setSelection(range.index + 1);
                }
            } catch (err) {
                console.error(err);
                alert('Image upload failed.');
            }
        };
    }

    // Wire UI events
    if (titleEl) titleEl.addEventListener('input', (e) => { if (!slugTouched && slugEl) slugEl.value = generateSlug(e.target.value); });
    if (slugEl) slugEl.addEventListener('input', () => { slugTouched = true; });
    if (btnGenSlugEl) btnGenSlugEl.addEventListener('click', () => { if (titleEl && slugEl) { slugEl.value = generateSlug(titleEl.value); slugTouched = true; } });

    if (btnClearImageEl) btnClearImageEl.addEventListener('click', () => {
        uploadedImagePath = null;
        if (uploadedPreviewEl) uploadedPreviewEl.innerHTML = '';
        if (imageFileEl) imageFileEl.value = '';
    });

    if (imageFileEl) {
        imageFileEl.addEventListener('change', async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const fd = new FormData();
            fd.append('image', f);
            try {
                const res = await apiFetch(`${CONTENT_API}/admin/upload-image`, { method: 'POST', body: fd });
                if (!res.ok) {
                    const txt = await extractErrorText(res);
                    showError('Image upload failed: ' + txt);
                    return;
                }
                const js = await res.json();
                uploadedImagePath = js.url || (js.path ? `/static/${js.path}` : null);
                if (uploadedPreviewEl) uploadedPreviewEl.innerHTML = uploadedImagePath ? `<img src="${uploadedImagePath}" style="max-width:220px;border-radius:6px;">` : '';
            } catch (err) {
                console.error(err);
                showError('Upload failed (network).');
            }
        });
    }

    if (newBtnEl) newBtnEl.addEventListener('click', () => {
        editingId = null;
        if (editingIdInputEl) editingIdInputEl.value = '';
        storyFormEl.reset();
        quill && (quill.root.innerHTML = '');
        uploadedImagePath = null;
        if (uploadedPreviewEl) uploadedPreviewEl.innerHTML = '';
        slugTouched = false;
        if (editorTitleEl) editorTitleEl.textContent = 'New Story';
    });

    if (refreshBtnEl) refreshBtnEl.addEventListener('click', () => fetchStoriesAdmin());
    if (prevPageBtnEl) prevPageBtnEl.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; fetchStoriesAdmin(); } });
    if (nextPageBtnEl) nextPageBtnEl.addEventListener('click', () => { currentPage += 1; fetchStoriesAdmin(); });
    if (saveOrderBtnEl) saveOrderBtnEl.addEventListener('click', () => saveOrderAdmin());
    if (searchInputEl) searchInputEl.addEventListener('keyup', (e) => { if (e.key === 'Enter') { currentQuery = searchInputEl.value.trim(); currentPage = 1; fetchStoriesAdmin(); } });

    // Save (create/update) story
    storyFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus('Saving…');
        if (adminErrorEl) adminErrorEl.hidden = true;

        const payload = {
            title: titleEl ? titleEl.value.trim() : '',
            slug: slugEl ? slugEl.value.trim() : '',
            section: sectionEl ? sectionEl.value.trim() : '',
            excerpt: excerptEl ? excerptEl.value.trim() : '',
            body_html: quill ? quill.root.innerHTML : (bodyHiddenInput ? bodyHiddenInput.value : ''),
            author: authorEl ? authorEl.value.trim() : '',
            featured_image: uploadedImagePath
        };

        if (!payload.title) { showError('Title is required'); setStatus('', false); return; }
        if (!payload.slug) { showError('Slug is required'); setStatus('', false); return; }

        try {
            let res;
            if (editingId) {
                res = await apiFetch(`${CONTENT_API}/admin/stories/${editingId}`, {
                    method: 'PUT',
                    body: payload
                });
            } else {
                res = await apiFetch(`${CONTENT_API}/admin/stories`, {
                    method: 'POST',
                    body: payload
                });
            }
            if (!res.ok) {
                const txt = await extractErrorText(res);
                showError('Save failed: ' + txt);
                setStatus('', false);
                return;
            }
            setStatus('Saved');
            editingId = null;
            if (editingIdInputEl) editingIdInputEl.value = '';
            storyFormEl.reset();
            quill && (quill.root.innerHTML = '');
            if (uploadedPreviewEl) uploadedPreviewEl.innerHTML = '';
            uploadedImagePath = null;
            slugTouched = false;
            fetchStoriesAdmin();
        } catch (err) {
            console.error(err);
            showError('Save failed (network error).');
            setStatus('', false);
        } finally {
            setTimeout(() => setStatus(''), 1600);
        }
    });

    // Publish
    if (publishBtnEl) {
        publishBtnEl.addEventListener('click', async () => {
            const id = editingId || (editingIdInputEl ? editingIdInputEl.value : null);
            if (!id) { showError('Save the story first before publishing'); return; }
            try {
                const res = await apiFetch(`${CONTENT_API}/admin/stories/${id}/publish`, {
                    method: 'POST',
                    body: { action: 'publish' }
                });
                if (!res.ok) {
                    const txt = await extractErrorText(res);
                    showError('Publish failed: ' + txt);
                    return;
                }
                setStatus('Published');
                fetchStoriesAdmin();
            } catch (err) {
                console.error(err);
                showError('Publish failed (network).');
            } finally {
                setTimeout(() => setStatus(''), 1400);
            }
        });
    }

    // Fetch admin stories (paged, searchable)
    async function fetchStoriesAdmin() {
        if (!storiesListEl) return;
        storiesListEl.innerHTML = "<div style='color:#666'>Loading…</div>";
        try {
            const params = new URLSearchParams();
            params.set('page', currentPage);
            params.set('limit', currentLimit);
            if (currentQuery) params.set('q', currentQuery);
            const res = await apiFetch(`${CONTENT_API}/admin/stories?${params.toString()}`);
            if (!res.ok) {
                const txt = await extractErrorText(res);
                showError('Failed to load stories: ' + txt);
                storiesListEl.innerHTML = "<div style='color:#c00'>Unable to load stories.</div>";
                return;
            }
            const js = await res.json();
            renderStoriesAdmin(js.items || []);
        } catch (err) {
            console.error(err);
            storiesListEl.innerHTML = "<div style='color:#c00'>Error loading stories.</div>";
        }
    }

    // Render stories list with drag & reorder and action buttons
    function renderStoriesAdmin(list) {
        if (!Array.isArray(list) || list.length === 0) {
            storiesListEl.innerHTML = "<div>No stories yet.</div>";
            return;
        }
        storiesListEl.innerHTML = '';
        list.forEach(item => {
            const row = document.createElement('div');
            row.className = 'story-row';
            row.draggable = true;
            row.dataset.id = item.id;
            row.innerHTML = `
                <div style="display:flex;gap:8px;align-items:center;">
                  <span class="draggable-handle" title="Drag to reorder">☰</span>
                  <div>
                    <div style="font-weight:600">${escapeHtml(item.title)}</div>
                    <div class="meta" style="font-size:0.85rem;color:#666">${escapeHtml(item.slug || '')} • ${escapeHtml(item.section || '-')}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn small" data-action="edit" data-id="${item.id}">Edit</button>
                  <button class="btn small subtle" data-action="delete" data-id="${item.id}">Delete</button>
                </div>
            `;
            // drag handlers
            row.addEventListener('dragstart', adminHandleDragStart, false);
            row.addEventListener('dragover', adminHandleDragOver, false);
            row.addEventListener('drop', adminHandleDrop, false);
            row.addEventListener('dragend', adminHandleDragEnd, false);
            storiesListEl.appendChild(row);
        });

        // actions
        storiesListEl.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = e.currentTarget.dataset.action;
                const id = e.currentTarget.dataset.id;
                if (action === 'edit') return adminEditStory(id);
                if (action === 'delete') {
                    if (!confirm('Delete this story?')) return;
                    const r = await apiFetch(`${CONTENT_API}/admin/stories/${id}`, { method: 'DELETE' });
                    if (!r.ok) { showError('Delete failed (unauthorized).'); return; }
                    fetchStoriesAdmin();
                }
            });
        });
    }

    // Drag & drop admin helpers
    let dragSrcEl = null;
    function adminHandleDragStart(e) {
        dragSrcEl = e.currentTarget;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', e.currentTarget.dataset.id);
        e.currentTarget.style.opacity = '0.4';
    }
    function adminHandleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    }
    function adminHandleDrop(e) {
        e.stopPropagation();
        const srcId = e.dataTransfer.getData('text/plain');
        const dest = e.currentTarget;
        if (!srcId || !dest || dest.dataset.id === srcId) return;
        const srcEl = Array.from(storiesListEl.children).find(n => n.dataset.id === srcId);
        storiesListEl.insertBefore(srcEl, dest.nextSibling);
    }
    function adminHandleDragEnd(e) {
        e.currentTarget.style.opacity = '';
        Array.from(storiesListEl.children).forEach(c => c.classList.remove('drag-over'));
    }

    // Save order
    async function saveOrderAdmin() {
        const ids = Array.from(storiesListEl.children).map(ch => ch.dataset.id).filter(Boolean);
        if (!ids.length) return;
        try {
            const res = await apiFetch(`${CONTENT_API}/admin/stories/reorder`, {
                method: 'POST',
                body: { ids }
            });
            if (!res.ok) {
                const txt = await extractErrorText(res);
                showError('Save order failed: ' + txt);
                return;
            }
            setStatus('Order saved');
            fetchStoriesAdmin();
        } catch (err) {
            console.error(err);
            showError('Save order failed (network).');
        } finally {
            setTimeout(() => setStatus(''), 1600);
        }
    }

    // Edit story
    async function adminEditStory(id) {
        try {
            const listRes = await apiFetch(`${CONTENT_API}/admin/stories?page=1&limit=200`);
            if (!listRes.ok) { showError('Unable to fetch story'); return; }
            const listJs = await listRes.json();
            const item = (listJs.items || []).find(it => String(it.id) === String(id));
            if (!item) { showError('Story not found'); return; }
            editingId = item.id;
            if (editingIdInputEl) editingIdInputEl.value = item.id;
            if (editorTitleEl) editorTitleEl.textContent = 'Edit Story';
            if (titleEl) titleEl.value = item.title || '';
            if (slugEl) slugEl.value = item.slug || '';
            if (sectionEl) sectionEl.value = item.section || '';
            if (excerptEl) excerptEl.value = item.excerpt || '';
            if (authorEl) authorEl.value = item.author || '';

            // fetch public detail for body and featured image
            const detailRes = await apiFetch(`${CONTENT_API}/stories/${item.slug}`);
            if (detailRes.ok) {
                const djs = await detailRes.json();
                quill.root.innerHTML = djs.body_html || '';
                if (bodyHiddenInput) bodyHiddenInput.value = djs.body_html || '';
                uploadedImagePath = djs.featured_image || null;
                if (uploadedPreviewEl) uploadedPreviewEl.innerHTML = uploadedImagePath ? `<img src="${uploadedImagePath}" style="max-width:220px;border-radius:6px;">` : '';
            } else {
                quill.root.innerHTML = '';
                if (uploadedPreviewEl) uploadedPreviewEl.innerHTML = '';
            }
            slugTouched = true;
        } catch (err) {
            console.error(err);
            showError('Failed to load story for editing.');
        }
    }

    // Init
    initQuill();
    fetchStoriesAdmin();
})();

// End of admin.js