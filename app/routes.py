from flask import request, jsonify, session, render_template, url_for, redirect, current_app
from flask_mail import Message
from datetime import datetime
from . import db, mail
from .models import Brand, Product, HomepageProduct, Coupon, Order, OrderAttempt

# Helper: normalize image paths to browser-ready URLs


def to_static_url(path):
    """
    Convert a stored image path like 'images/creed/aventus.jpg'
    into a browser URL '/static/images/creed/aventus.jpg'.
    If path already starts with '/' or 'http', return as-is.
    """
    if not path:
        return "/static/images/placeholder.jpg"
    if isinstance(path, str) and (path.startswith("http://") or path.startswith("https://") or path.startswith("/")):
        return path
    return "/static/" + path.lstrip("/")


# -------------------------
# Page routes
# -------------------------
@current_app.route('/admin')
def admin_dashboard():
    return render_template('admin.html')


@current_app.route('/brand')
def brand():
    return render_template('brand.html')


@current_app.route('/brand_detail')
def brand_detail():
    return render_template('brand_detail.html')


@current_app.route('/checkout')
def checkout():
    return render_template('checkout.html')


@current_app.route('/cart')
def cart():
    return render_template('cart.html')


@current_app.route('/forgot_password')
def forgot_password():
    return render_template('forgot_password.html')


# -------------------------
# Auth endpoints
# -------------------------
@current_app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    # Accept either username or email (frontend uses email in many places)
    identity = (data.get('username') or data.get('email') or "").strip()
    password = data.get('password') or ""
    # Simple demo auth: allow admin/password123 or admin@example.com/password123
    if (identity.lower() in ('admin', 'admin@example.com')) and password == 'password123':
        session['user'] = identity
        return jsonify({"user": {"username": "admin", "role": "admin"}})
    return jsonify({"error": "Invalid credentials"}), 401


@current_app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('user', None)
    return jsonify({"success": True})


# -------------------------
# Brands / Products
# -------------------------
@current_app.route('/api/brands', methods=['GET'])
def get_brands():
    brands = Brand.query.order_by(Brand.name).all()
    return jsonify([{
        "name": b.name,
        "logo": to_static_url(b.logo_url),
        "description": b.description
    } for b in brands])


@current_app.route('/api/brands', methods=['POST'])
def add_brand():
    data = request.json or {}
    brand = Brand(name=data.get("name"),
                  description=data.get("description", ""))
    db.session.add(brand)
    db.session.commit()
    return jsonify({"success": True})


@current_app.route('/api/brands/<name>', methods=['PUT'])
def update_brand(name):
    b = Brand.query.filter_by(name=name).first()
    if not b:
        return jsonify({"error": "Brand not found"}), 404
    data = request.json or {}
    b.description = data.get("description", b.description)
    db.session.commit()
    return jsonify({"success": True})


@current_app.route('/api/brands/<name>', methods=['DELETE'])
def delete_brand(name):
    b = Brand.query.filter_by(name=name).first()
    if b:
        Product.query.filter_by(brand=name).delete()
        db.session.delete(b)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"error": "Brand not found"}), 404


@current_app.route('/api/products', methods=['GET'])
def get_products():
    products = Product.query.all()
    return jsonify([
        {
            "id": p.id,
            "brand": p.brand,
            "title": p.title,
            "price": p.price,
            "description": p.description,
            "keyNotes": p.keyNotes.split(";") if p.keyNotes else [],
            "image_url": to_static_url(p.image_url or p.image_url_dynamic),
            "thumbnails": p.thumbnails if p.thumbnails else "",
            "status": p.status,
            "quantity": p.quantity,
            "tags": p.tags
        }
        for p in products
    ])


@current_app.route('/api/products', methods=['POST'])
def add_product():
    data = request.json or {}
    product = Product(
        id=data.get("id"),
        brand=data.get("brand"),
        title=data.get("title"),
        price=float(data.get("price") or 0),
        description=data.get("description", ""),
        keyNotes=data.get("keyNotes", ""),
        image_url=data.get("image_url", data.get("imageUrl", "")),
        thumbnails=data.get("thumbnails", ""),
        status=data.get("status", "restocked"),
        quantity=int(data.get("quantity", 10)),
        tags=data.get("tags", "")
    )
    db.session.add(product)
    db.session.commit()
    return jsonify({"success": True})


@current_app.route('/api/products/<id>', methods=['PUT'])
def update_product(id):
    prod = Product.query.filter_by(id=id).first()
    if not prod:
        return jsonify({"error": "Product not found"}), 404
    data = request.json or {}
    prod.title = data.get("title", prod.title)
    prod.brand = data.get("brand", prod.brand)
    prod.price = float(data.get("price", prod.price))
    prod.description = data.get("description", prod.description)
    prod.keyNotes = data.get("keyNotes", prod.keyNotes)
    prod.image_url = data.get("image_url", prod.image_url)
    prod.thumbnails = data.get("thumbnails", prod.thumbnails)
    prod.status = data.get("status", prod.status)
    prod.quantity = int(data.get("quantity", prod.quantity))
    prod.tags = data.get("tags", prod.tags)
    db.session.commit()
    return jsonify({"success": True})


@current_app.route('/api/products/<id>', methods=['DELETE'])
def delete_product(id):
    prod = Product.query.filter_by(id=id).first()
    if prod:
        db.session.delete(prod)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"error": "Product not found"}), 404


@current_app.route('/api/products/status/<id>', methods=['PUT'])
def update_product_status(id):
    data = request.json or {}
    prod = Product.query.filter_by(id=id).first()
    if prod:
        prod.status = data.get("status", prod.status)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"error": "Product not found"}), 404


@current_app.route('/api/products/<brand>', methods=['GET'])
def get_products_by_brand(brand):
    # If brand param actually matches a product id, return that product
    by_id = Product.query.filter_by(id=brand).first()
    if by_id:
        return jsonify({
            "id": by_id.id,
            "brand": by_id.brand,
            "title": by_id.title,
            "price": by_id.price,
            "description": by_id.description,
            "keyNotes": by_id.keyNotes.split(";") if by_id.keyNotes else [],
            "image_url": to_static_url(by_id.image_url or by_id.image_url_dynamic),
            "thumbnails": by_id.thumbnails if by_id.thumbnails else "",
            "status": by_id.status,
            "quantity": by_id.quantity,
            "tags": by_id.tags
        })
    brand_name = brand.replace('_', ' ')
    products = Product.query.filter_by(brand=brand_name).all()
    return jsonify([
        {
            "id": p.id,
            "brand": p.brand,
            "title": p.title,
            "price": p.price,
            "description": p.description,
            "keyNotes": p.keyNotes.split(";") if p.keyNotes else [],
            "image_url": to_static_url(p.image_url or p.image_url_dynamic),
            "thumbnails": p.thumbnails if p.thumbnails else "",
            "status": p.status,
            "quantity": p.quantity,
            "tags": p.tags
        }
        for p in products
    ])


@current_app.route('/api/products/<brand>/<product>', methods=['GET'])
def get_product_detail(brand, product):
    brand_name = brand.replace('_', ' ')
    product_title = product.replace('_', ' ')
    prod = Product.query.filter_by(
        brand=brand_name, title=product_title).first()
    if not prod:
        return jsonify({"error": "Product not found"}), 404
    return jsonify({
        "id": prod.id,
        "brand": prod.brand,
        "title": prod.title,
        "price": prod.price,
        "description": prod.description,
        "keyNotes": prod.keyNotes.split(";") if prod.keyNotes else [],
        "image_url": to_static_url(prod.image_url or prod.image_url_dynamic),
        "thumbnails": prod.thumbnails if prod.thumbnails else "",
        "status": prod.status,
        "quantity": prod.quantity,
        "tags": prod.tags
    })


@current_app.route('/api/homepage-products', methods=['GET'])
def get_homepage_products():
    homepage_products = HomepageProduct.query.order_by(
        HomepageProduct.section, HomepageProduct.sort_order).all()
    products = {p.id: p for p in Product.query.all()}
    result = {"signature": [], "men": [], "women": [], "offers": []}
    for hp in homepage_products:
        if not hp.visible:
            continue
        prod = products.get(hp.product_id)
        if prod:
            result.setdefault(hp.section, []).append({
                "homepage_id": hp.homepage_id,
                "section": hp.section,
                "id": prod.id,
                "title": prod.title,
                "brand": prod.brand,
                "price": prod.price,
                "image_url": to_static_url(prod.image_url or prod.image_url_dynamic),
                "sort_order": hp.sort_order,
                "visible": hp.visible
            })
    return jsonify(result)


@current_app.route('/api/homepage-products', methods=['POST'])
def add_homepage_product():
    data = request.json or {}
    hp = HomepageProduct(
        section=data.get("section"),
        product_id=data.get("product_id"),
        sort_order=int(data.get("sort_order", 0)),
        visible=bool(data.get("visible", True))
    )
    db.session.add(hp)
    db.session.commit()
    return jsonify({"success": True})


@current_app.route('/api/homepage-products/<int:homepage_id>', methods=['PUT'])
def update_homepage_product(homepage_id):
    hp = HomepageProduct.query.filter_by(homepage_id=homepage_id).first()
    if not hp:
        return jsonify({"error": "Homepage product not found"}), 404
    data = request.json or {}
    hp.section = data.get("section", hp.section)
    hp.product_id = data.get("product_id", hp.product_id)
    hp.sort_order = int(data.get("sort_order", hp.sort_order))
    hp.visible = bool(data.get("visible", hp.visible))
    db.session.commit()
    return jsonify({"success": True})


@current_app.route('/api/homepage-products/<int:homepage_id>', methods=['DELETE'])
def delete_homepage_product(homepage_id):
    hp = HomepageProduct.query.filter_by(homepage_id=homepage_id).first()
    if hp:
        db.session.delete(hp)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"error": "Homepage product not found"}), 404


@current_app.route('/api/cart/add', methods=['POST'])
def add_to_cart():
    data = request.json or {}
    product_id = data.get("product_id")
    qty = int(data.get("quantity", 1))
    prod = Product.query.filter_by(id=product_id).first()
    if not prod:
        return jsonify({"error": "Product not found"}), 404
    if prod.quantity < qty:
        return jsonify({"error": "Sold Out", "quantity_left": prod.quantity}), 400
    prod.quantity -= qty
    db.session.commit()
    if prod.quantity == 0:
        prod.status = "out-of-stock"
        db.session.commit()
    return jsonify({"success": True, "quantity_left": prod.quantity})


@current_app.route('/api/order-attempts', methods=['POST'])
def log_order_attempt():
    data = request.json or {}
    attempt = OrderAttempt(
        email=data.get("email", ""),
        product=data.get("product", ""),
        qty=data.get("qty", 1),
        status=data.get("status", "Carted"),
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    db.session.add(attempt)
    db.session.commit()
    return jsonify({"success": True})


@current_app.route('/api/products/similar', methods=['GET'])
def get_similar_products():
    product_id = request.args.get("product_id")
    prod = Product.query.filter_by(id=product_id).first()
    if not prod or not prod.tags:
        return jsonify([])
    tag_list = [t.strip().lower() for t in prod.tags.split(',') if t.strip()]
    similar = Product.query.filter(Product.id != prod.id).all()
    result = []
    for p in similar:
        if not p.tags:
            continue
        ptags = set([tt.strip().lower()
                    for tt in p.tags.split(',') if tt.strip()])
        if set(tag_list) & ptags:
            result.append({
                "id": p.id,
                "title": p.title,
                "brand": p.brand,
                "image_url": to_static_url(p.image_url or p.image_url_dynamic),
                "thumbnails": p.thumbnails if p.thumbnails else "",
                "tags": p.tags
            })
    return jsonify(result)


@current_app.route('/api/coupons', methods=['GET'])
def get_coupons():
    coupons = Coupon.query.order_by(Coupon.start_date.desc()).all()
    return jsonify([
        {
            "code": c.code,
            "description": c.description,
            "discount_type": c.discount_type,
            "discount_value": c.discount_value,
            "start_date": c.start_date,
            "end_date": c.end_date,
            "active": c.active
        }
        for c in coupons
    ])


@current_app.route('/api/coupons', methods=['POST'])
def add_coupon():
    data = request.json or {}
    c = Coupon.query.filter_by(code=data.get("code")).first()
    if c:
        db.session.delete(c)
        db.session.commit()
    active_val = data.get("active", True)
    if isinstance(active_val, bool):
        active = active_val
    elif isinstance(active_val, str):
        active = active_val.lower() == "true"
    else:
        active = bool(active_val)
    coupon = Coupon(
        code=data.get("code"),
        description=data.get("description", ""),
        discount_type=data.get("discount_type", "percent"),
        discount_value=float(data.get("discount_value", 0)),
        start_date=data.get("start_date", ""),
        end_date=data.get("end_date", ""),
        active=active
    )
    db.session.add(coupon)
    db.session.commit()
    return jsonify({"success": True})


@current_app.route('/api/coupons/<code>', methods=['PUT'])
def update_coupon(code):
    coupon = Coupon.query.filter_by(code=code).first()
    if not coupon:
        return jsonify({"error": "Coupon not found"}), 404
    data = request.json or {}
    coupon.description = data.get("description", coupon.description)
    coupon.discount_type = data.get("discount_type", coupon.discount_type)
    coupon.discount_value = float(
        data.get("discount_value", coupon.discount_value))
    coupon.start_date = data.get("start_date", coupon.start_date)
    coupon.end_date = data.get("end_date", coupon.end_date)
    active_val = data.get("active", coupon.active)
    if isinstance(active_val, bool):
        coupon.active = active_val
    elif isinstance(active_val, str):
        coupon.active = active_val.lower() == "true"
    else:
        coupon.active = bool(active_val)
    db.session.commit()
    return jsonify({"success": True})


@current_app.route('/api/coupons/<code>', methods=['DELETE'])
def delete_coupon(code):
    coupon = Coupon.query.filter_by(code=code).first()
    if coupon:
        db.session.delete(coupon)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"error": "Coupon not found"}), 404


@current_app.route('/api/orders', methods=['GET'])
def get_orders():
    orders = Order.query.order_by(Order.date.desc()).all()
    return jsonify([
        {
            "id": o.id,
            "customer_name": o.customer_name,
            "customer_email": o.customer_email,
            "customer_phone": o.customer_phone,
            "customer_address": o.customer_address,
            "product_id": o.product_id,
            "product_title": o.product_title,
            "quantity": o.quantity,
            "status": o.status,
            "payment_method": o.payment_method,
            "date": o.date
        }
        for o in orders
    ])


@current_app.route('/api/orders', methods=['POST'])
def add_order():
    data = request.json or {}
    customer_name = data.get("customer_name") or data.get("customer") or ""
    customer_email = data.get("customer_email") or data.get("email") or ""
    customer_phone = data.get("customer_phone") or data.get("phone") or ""
    customer_address = data.get(
        "customer_address") or data.get("address") or ""
    product_id = data.get("product_id") or ""
    product_title = data.get("product_title") or data.get("product") or ""
    quantity = int(data.get("quantity") or data.get("qty") or 1)
    status = data.get("status", "Pending")
    payment_method = data.get("payment_method", "Cash on Delivery")
    date = data.get("date", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    order = Order(
        customer_name=customer_name,
        customer_email=customer_email,
        customer_phone=customer_phone,
        customer_address=customer_address,
        product_id=product_id,
        product_title=product_title,
        quantity=quantity,
        status=status,
        payment_method=payment_method,
        date=date
    )
    db.session.add(order)
    db.session.commit()
    # === EMAIL FEATURE: Send confirmation email after saving ===
    email_body = f"""
Hi {customer_name},

Thank you for your order with WPerfumes!

Order Details:
Product: {product_title}
Quantity: {quantity}
Payment Method: {payment_method}
Delivery Address: {customer_address}
Status: {status}
Date: {date}

For any questions, reply to this email.
Best Regards,
WPerfumes Team
"""
    try:
        sender = current_app.config.get('MAIL_USERNAME') or None
        msg = Message(
            subject="Your WPerfumes Order Confirmation",
            sender=sender,
            recipients=[customer_email],
            body=email_body
        )
        mail.send(msg)
    except Exception as e:
        print(f"Error sending email: {e}")

    return jsonify({"success": True})


@current_app.route('/api/orders/<int:order_id>', methods=['PUT'])
def update_order(order_id):
    order = Order.query.filter_by(id=order_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404
    data = request.json or {}
    old_status = order.status  # Save the old status before updating

    order.customer_name = data.get("customer_name", order.customer_name)
    order.customer_email = data.get("customer_email", order.customer_email)
    order.customer_phone = data.get("customer_phone", order.customer_phone)
    order.customer_address = data.get(
        "customer_address", order.customer_address)
    order.product_id = data.get("product_id", order.product_id)
    order.product_title = data.get("product_title", order.product_title)
    order.quantity = int(data.get("quantity", order.quantity))
    order.status = data.get("status", order.status)
    order.payment_method = data.get("payment_method", order.payment_method)
    order.date = data.get("date", order.date)
    db.session.commit()

    # If the status changed, send a notification email
    if order.status != old_status:
        email_body = f"""
Hi {order.customer_name},

Your order for {order.product_title} has been updated!

Order Details:
Product: {order.product_title}
Quantity: {order.quantity}
Payment Method: {order.payment_method}
Delivery Address: {order.customer_address}
Current Status: {order.status}
Date: {order.date}

You can reply to this email if you have any questions.
Best Regards,
WPerfumes Team
        """
        try:
            sender = current_app.config.get('MAIL_USERNAME') or None
            msg = Message(
                subject=f"Order Update: {order.product_title} is now '{order.status}'",
                sender=sender,
                recipients=[order.customer_email],
                body=email_body
            )
            mail.send(msg)
        except Exception as e:
            print(f"Error sending update email: {e}")

    return jsonify({"success": True})


@current_app.route('/api/orders/<int:order_id>', methods=['DELETE'])
def delete_order(order_id):
    order = Order.query.filter_by(id=order_id).first()
    if order:
        db.session.delete(order)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"error": "Order not found"}), 404


# ===========================
# NEW: Page Routes for HTML
# ===========================

# Add this function somewhere in app/routes.py (near other page routes)
@current_app.route('/offers')
def offers():
    # return an offers template; create templates/offers.html if it doesn't exist
    return render_template('offers.html')


@current_app.route('/')
def index():
    return render_template('index.html')


@current_app.route('/men')
def men():
    return render_template('men.html')


@current_app.route('/women')
def women():
    return render_template('women.html')


@current_app.route('/beauty')
def beauty():
    return render_template('beauty.html')


@current_app.route('/login')
def login_page():
    return render_template('login.html')


@current_app.route('/signup')
def signup():
    return render_template('signup.html')


@current_app.route('/brand/<brand>')
def brand_page(brand):
    return render_template('brand_detail.html')


@current_app.route('/brand/<brand>/product/<product>')
def brand_product_page(brand, product):
    return render_template('brand_detail.html')
