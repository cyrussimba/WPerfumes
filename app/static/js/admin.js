// Use relative API base so code works in development and when deployed (Render, etc.)
const API = "/api";
// Helper: normalize returned image paths to usable browser URLs
function toStaticUrl(url) {
    if (!url) return '/static/images/placeholder.jpg';
    if (typeof url !== 'string') return '/static/images/placeholder.jpg';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return url;
    // backend might return 'images/brand/img.jpg' -> prefix with /static/
    return `/static/${url}`;
}

let user = null;
document.getElementById('tabBrands').onclick = () => switchTab('brands');
document.getElementById('tabProducts').onclick = () => switchTab('products');
document.getElementById('tabHomepage').onclick = () => switchTab('homepage');
document.getElementById('tabTopPicks').onclick = () => switchTab('topPicks');
document.getElementById('tabCoupons').onclick = () => switchTab('coupons');
document.getElementById('tabOrders').onclick = () => switchTab('orders');
function switchTab(tab) {
    document.getElementById('tabBrands').classList.toggle('active', tab === 'brands');
    document.getElementById('tabProducts').classList.toggle('active', tab === 'products');
    document.getElementById('tabHomepage').classList.toggle('active', tab === 'homepage');
    document.getElementById('tabTopPicks').classList.toggle('active', tab === 'topPicks');
    document.getElementById('tabCoupons').classList.toggle('active', tab === 'coupons');
    document.getElementById('tabOrders').classList.toggle('active', tab === 'orders');
    document.getElementById('brandsCard').style.display = tab === 'brands' ? '' : 'none';
    document.getElementById('productsCard').style.display = tab === 'products' ? '' : 'none';
    document.getElementById('homepageCard').style.display = tab === 'homepage' ? '' : 'none';
    document.getElementById('topPicksCard').style.display = tab === 'topPicks' ? '' : 'none';
    document.getElementById('couponsCard').style.display = tab === 'coupons' ? '' : 'none';
    document.getElementById('ordersCard').style.display = tab === 'orders' ? '' : 'none';
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

// ---------- Modified login handler (better debugging output + credentials included) ----------
document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    const username = document.getElementById('username').value, password = document.getElementById('password').value;
    const loginErrorEl = document.getElementById('loginError');
    loginErrorEl.style.display = 'none';
    try {
        // include credentials in case backend uses cookie/session or requires them
        const res = await fetch(`${API}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        // log details so you can see status + headers in console
        console.log('Login response status:', res.status);
        // attempt to read text (safe even if JSON)
        const bodyText = await res.text().catch(() => '');
        console.log('Login response body:', bodyText);

        if (!res.ok) {
            // show server response text (usually contains reason)
            loginErrorEl.textContent = `Login failed (${res.status}): ${bodyText || res.statusText}`;
            loginErrorEl.style.display = 'block';
            alert('Login failed: ' + (bodyText || res.statusText));
            return;
        }

        // success — parse JSON if possible
        let json = null;
        try { json = JSON.parse(bodyText); } catch (err) { json = null; }
        user = json && json.user ? json.user : null;
        document.getElementById('loginBg').style.display = 'none';
        const userInfo = document.getElementById('userInfo');
        if (userInfo) userInfo.style.display = '';
        const usernameInfo = document.getElementById('usernameInfo');
        if (usernameInfo) usernameInfo.textContent = user ? user.username : username;
        switchTab('brands');
    } catch (err) {
        console.error('Network/login error', err);
        loginErrorEl.textContent = 'Network error: ' + err.message;
        loginErrorEl.style.display = 'block';
        alert('Network error during login: ' + err.message);
    }
};
// -----------------------------------------------------------------------------------------

document.getElementById('logoutBtn').onclick = async () => {
    try {
        await fetch(`${API}/auth/logout`, { method: "POST" });
    } catch (e) { /* ignore */ }
    location.reload();
};
// ----------- Site Settings Discount JS -----------
async function loadDiscountSetting() {
    try {
        const r = await fetch(`${API}/settings/checkout_discount`);
        if (!r.ok) return;
        const js = await r.json();
        document.getElementById('checkout_discount_percent').value = js.percent ?? 0;
    } catch (err) {
        console.warn('Failed to load discount setting', err);
    }
}
document.getElementById('discountSettingForm').onsubmit = async function (e) {
    e.preventDefault();
    const percent = parseFloat(document.getElementById('checkout_discount_percent').value || 0);
    const msg = document.getElementById('discountSaveMsg');
    msg.textContent = "Saving...";
    try {
        const r = await fetch(`${API}/settings/checkout_discount`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ percent })
        });
        if (r.ok) {
            msg.textContent = "Saved!";
        } else {
            msg.textContent = "Failed!";
        }
    } catch {
        msg.textContent = "Failed!";
    }
    setTimeout(() => { msg.textContent = ""; }, 1800);
};
loadDiscountSetting();
// ----------- Brands -----------
async function loadBrands() {
    try {
        const res = await fetch(`${API}/brands`);
        if (!res.ok) return;
        const brands = await res.json();
        const tbody = document.querySelector('#brandsTable tbody');
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
document.getElementById('addBrandBtn').onclick = () => showBrandModal();
window.editBrand = function (name) {
    fetch(`${API}/brands`).then(res => res.json()).then(brands => {
        const brand = brands.find(b => b.name === name);
        showBrandModal(brand);
    }).catch(err => console.warn(err));
};
function showBrandModal(brand) {
    document.getElementById('modalBg').style.display = 'flex';
    document.getElementById('modalContent').innerHTML = `
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
    document.getElementById('brandForm').onsubmit = async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        try {
            let res;
            if (!brand) {
                res = await fetch(`${API}/brands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
            } else {
                res = await fetch(`${API}/brands/${encodeURIComponent(brand.name)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
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
            await fetch(`${API}/brands/${encodeURIComponent(name)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadBrands();
    }
};
// ----------- Products -----------
async function loadProducts() {
    try {
        const res = await fetch(`${API}/products`);
        if (!res.ok) return;
        const products = await res.json();
        const tbody = document.querySelector('#productsTable tbody');
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
document.getElementById('addProductBtn').onclick = () => showProductModal();
window.editProduct = function (id) {
    fetch(`${API}/products`).then(res => res.json()).then(products => {
        const p = products.find(x => x.id === id);
        showProductModal(p);
    }).catch(err => console.warn(err));
};
function showProductModal(product) {
    fetch(`${API}/brands`).then(res => res.json()).then(brands => {
        document.getElementById('modalBg').style.display = 'flex';
        document.getElementById('modalContent').innerHTML = `
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
                    res = await fetch(`${API}/products/${encodeURIComponent(product.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
                } else {
                    data.id = 'PRD' + Math.floor(Date.now() / 10000).toString().slice(-4) + Math.floor(Math.random() * 99).toString().padStart(2, '0');
                    data.quantity = parseInt(data.quantity, 10) || 0;
                    data.tags = data.tags || '';
                    data.thumbnails = data.thumbnails || '';
                    res = await fetch(`${API}/products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
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
            await fetch(`${API}/products/${encodeURIComponent(id)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadProducts();
    }
};
// ----------- Homepage Products -----------
async function loadHomepageProducts() {
    try {
        const res = await fetch(`${API}/homepage-products`);
        if (!res.ok) return;
        const all = await res.json();
        let allRows = [];
        for (const section in all) {
            for (const item of all[section]) {
                allRows.push(item);
            }
        }
        const tbody = document.querySelector('#homepageTable tbody');
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
document.getElementById('addHomepageBtn').onclick = () => showHomepageModal();
window.editHomepageProduct = function (homepage_id) {
    fetch(`${API}/homepage-products`).then(res => res.json()).then(all => {
        let found;
        for (const section in all) {
            found = all[section].find(hp => hp.homepage_id == homepage_id);
            if (found) break;
        }
        showHomepageModal(found, homepage_id);
    }).catch(err => console.warn(err));
};
function showHomepageModal(hp, homepage_id) {
    fetch(`${API}/products`).then(res => res.json()).then(products => {
        document.getElementById('modalBg').style.display = 'flex';
        document.getElementById('modalContent').innerHTML = `
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
                    await fetch(`${API}/homepage-products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
                } else {
                    await fetch(`${API}/homepage-products/${encodeURIComponent(homepage_id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
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
            await fetch(`${API}/homepage-products/${encodeURIComponent(homepage_id)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadHomepageProducts();
    }
};
// ----------- Top Picks -----------
async function loadTopPicks() {
    try {
        const res = await fetch(`${API}/top-picks`);
        if (!res.ok) return;
        const topPicks = await res.json();
        const tbody = document.querySelector('#topPicksTable tbody');
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
document.getElementById('addTopPickBtn').onclick = () => showTopPickModal();
window.editTopPick = function (id) {
    fetch(`${API}/top-picks`).then(res => res.json()).then(topPicks => {
        const tp = topPicks.find(x => x.id === id);
        showTopPickModal(tp);
    }).catch(err => console.warn(err));
};
function showTopPickModal(tp) {
    fetch(`${API}/products`).then(res => res.json()).then(products => {
        document.getElementById('modalBg').style.display = 'flex';
        document.getElementById('modalContent').innerHTML = `
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
                    // Create top pick and auto-push it so the front-end (men.html) shows it immediately
                    const createRes = await fetch(`${API}/top-picks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
                    if (!createRes.ok) {
                        const err = await createRes.text();
                        alert('Save failed: ' + err);
                    } else {
                        // Expect backend to return created object with id
                        let createdObj = null;
                        try {
                            createdObj = await createRes.json();
                        } catch (jsonErr) {
                            console.warn('Created top-pick did not return JSON or had no id', jsonErr);
                        }
                        // If we have an id, attempt to push automatically
                        if (createdObj && createdObj.id) {
                            try {
                                await fetch(`${API}/top-picks/${encodeURIComponent(createdObj.id)}/push`, { method: "POST" });
                                // optional: notify admin that it was pushed
                                console.log('Top Pick created and pushed:', createdObj.id);
                            } catch (pushErr) {
                                console.warn('Top Pick created but automatic push failed', pushErr);
                            }
                        } else {
                            // Fallback: if backend returns no JSON id, you may need to manually push from list
                            console.log('Top Pick created; if it does not appear on the frontend, use the Publish button in Top Picks list to push it.');
                        }
                    }
                } else {
                    const res = await fetch(`${API}/top-picks/${encodeURIComponent(tp.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
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
            await fetch(`${API}/top-picks/${encodeURIComponent(id)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadTopPicks();
    }
};
window.pushTopPick = async function (id) {
    try {
        await fetch(`${API}/top-picks/${encodeURIComponent(id)}/push`, { method: "POST" });
        alert("Top Pick pushed to front end!");
    } catch (e) {
        alert("Failed to push Top Pick.");
    }
};
// ----------- Promotions -----------
async function loadCoupons() {
    try {
        const res = await fetch(`${API}/coupons`);
        if (!res.ok) return;
        const promos = await res.json();
        const tbody = document.querySelector('#couponsTable tbody');
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
document.getElementById('addCouponBtn').onclick = () => showCouponModal();
window.editCoupon = function (code) {
    fetch(`${API}/coupons`).then(res => res.json()).then(promos => {
        const promo = promos.find(c => c.code === code);
        showCouponModal(promo);
    }).catch(err => console.warn(err));
};
function showCouponModal(promo) {
    document.getElementById('modalBg').style.display = 'flex';
    document.getElementById('modalContent').innerHTML = `
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
                await fetch(`${API}/coupons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
            } else {
                await fetch(`${API}/coupons/${encodeURIComponent(promo.code)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
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
            await fetch(`${API}/coupons/${encodeURIComponent(code)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadCoupons();
    }
};
// ----------- Orders -----------
async function loadOrders() {
    try {
        const res = await fetch(`${API}/orders`);
        if (!res.ok) return;
        const orders = await res.json();
        const tbody = document.querySelector('#ordersTable tbody');
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
document.getElementById('addOrderBtn').onclick = () => showOrderModal();
window.editOrder = function (id) {
    fetch(`${API}/orders`).then(res => res.json()).then(orders => {
        const order = orders.find(o => o.id == id);
        showOrderModal(order);
    }).catch(err => console.warn(err));
};
function showOrderModal(order) {
    fetch(`${API}/products`).then(res => res.json()).then(products => {
        fetch(`${API}/coupons`).then(res => res.json()).then(promos => {
            document.getElementById('modalBg').style.display = 'flex';
            document.getElementById('modalContent').innerHTML = `
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
                        await fetch(`${API}/orders/${encodeURIComponent(order.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
                    } else {
                        await fetch(`${API}/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
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
            await fetch(`${API}/orders/${encodeURIComponent(order_id)}`, { method: "DELETE" });
        } catch (e) { /* ignore */ }
        loadOrders();
    }
}

// Modal helpers
function closeModal() { document.getElementById('modalBg').style.display = 'none'; }
document.getElementById('modalBg').onclick = function (e) {
    if (e.target === this) closeModal();
};
switchTab('brands');