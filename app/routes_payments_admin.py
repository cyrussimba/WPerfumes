from __future__ import annotations
import os
import json
import logging
from functools import wraps
from typing import Dict, Any, List, Optional

from flask import Blueprint, request, Response, render_template, jsonify, current_app, abort, session
from werkzeug.security import check_password_hash, generate_password_hash

# Import SQLAlchemy models (ensure app/models_payments.py was added and migrations run)
try:
    from .models_payments import Payment, Order, PaymentsAdminUser  # type: ignore
    from . import db  # type: ignore
except Exception:
    Payment = None
    Order = None
    PaymentsAdminUser = None
    db = None

# Optionally reuse PayPal helper functions if you have payments_paypal implemented
try:
    from .payments_paypal import get_paypal_access_token, PAYPAL_BASE  # type: ignore
except Exception:
    get_paypal_access_token = None
    PAYPAL_BASE = None

import requests

bp = Blueprint("payments_admin", __name__,
               template_folder="templates", url_prefix="/payments-admin")
logger = logging.getLogger(__name__)

# Load admin credentials from environment. Expected format:
# PAYMENTS_ADMIN_TOKEN='long-random-token'


def _get_admin_token() -> str:
    return os.environ.get("PAYMENTS_ADMIN_TOKEN", "")


# Access control decorator: HTTP Basic or header token + role check (now supports DB users)
def require_payments_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        # First: allow API token header for programmatic access
        token = _get_admin_token()
        header_token = request.headers.get(
            "X-ADMIN-TOKEN") or request.args.get("admin_token")
        if token and header_token and header_token == token:
            return f(*args, **kwargs)

        # If the current session is a site admin (session-based admin panel), allow
        if session.get("user") in ("admin", "admin@example.com"):
            # session admin may access payments-admin pages for management tasks
            return f(*args, **kwargs)

        # Otherwise require HTTP Basic auth
        auth = request.authorization
        if not auth:
            return Response("Authentication required", 401, {"WWW-Authenticate": 'Basic realm="Payments Admin"'})

        # If PaymentsAdminUser table exists, validate against DB first
        if PaymentsAdminUser is not None:
            try:
                u = PaymentsAdminUser.query.filter_by(
                    username=auth.username).first()
                if u and check_password_hash(u.password_hash, auth.password or ""):
                    role = (u.role or "").strip().lower()
                    if role in ("ceo", "chairman", "cfo"):
                        # Attach user info for handlers optionally
                        request.payments_admin_user = {
                            "username": u.username, "role": u.role}
                        return f(*args, **kwargs)
                    else:
                        logger.warning(
                            "Payments admin access denied for user %s with role %s", auth.username, u.role)
                        return Response("Forbidden - insufficient privileges", 403)
                # fallthrough to env-based or deny
            except Exception:
                logger.exception(
                    "Error checking PaymentsAdminUser for %s", auth.username)
                # fallthrough and try env or deny

        # If DB user not found or table missing, fall back to env-based admin list (backwards compatibility)
        # Environment-based list is optional; if not configured we deny.
        raw_users = os.environ.get("PAYMENTS_ADMIN_USERS", "")
        if raw_users:
            try:
                allowed = json.loads(raw_users)
                for u in allowed:
                    if u.get("username") == auth.username:
                        # check password_hash if present; password_hash must be a werkzeug hash
                        ph = u.get("password_hash")
                        if ph and check_password_hash(ph, auth.password or ""):
                            role = (u.get("role") or "").strip().lower()
                            if role in ("ceo", "chairman", "cfo"):
                                request.payments_admin_user = {
                                    "username": auth.username, "role": u.get("role")}
                                return f(*args, **kwargs)
                                # else forbidden
                # not found in env list, deny
            except Exception:
                logger.exception(
                    "Failed to parse PAYMENTS_ADMIN_USERS env var")
        logger.warning("Payments admin auth failed for %s",
                       auth.username if auth else "<no auth>")
        return Response("Forbidden", 403)
    return wrapper


# Management UI & API for site-admin to create top-management users via the website.
# This route is protected by the existing site admin session (session['user'] == 'admin' or 'admin@example.com')
def require_site_admin_session(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if session.get("user") in ("admin", "admin@example.com"):
            return f(*args, **kwargs)
        return jsonify({"error": "Unauthorized"}), 401
    return wrapper


@bp.route("/", methods=["GET"])
@require_payments_admin
def index():
    # Renders the payments admin UI (template already added at templates/payments_admin.html)
    return render_template("payments_admin.html")


@bp.route("/manage-users", methods=["GET"])
@require_site_admin_session
def manage_users_page():
    """
    Simple web UI for site admin to create/manage top-management payments users.
    Accessible if you are logged into the main admin session (session user 'admin').
    """
    return render_template("payments_manage_users.html")


@bp.route("/api/manage-users", methods=["GET"])
@require_site_admin_session
def api_list_manage_users():
    """
    Returns JSON list of payments admin users (for the manage UI).
    """
    if PaymentsAdminUser is None:
        return jsonify({"error": "payments admin users model not available"}), 500
    users = PaymentsAdminUser.query.order_by(PaymentsAdminUser.username).all()
    return jsonify([{"id": u.id, "username": u.username, "role": u.role, "created_at": u.created_at.isoformat()} for u in users])


@bp.route("/api/manage-users", methods=["POST"])
@require_site_admin_session
def api_create_manage_user():
    """
    Create a PaymentsAdminUser record.
    Body JSON: { "username": "...", "password": "...", "role": "CEO" }
    """
    if PaymentsAdminUser is None or db is None:
        return jsonify({"error": "payments admin users model not available"}), 500
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = (data.get("role") or "").strip()
    if not username or not password or not role:
        return jsonify({"error": "username, password and role required"}), 400
    if role.lower() not in ("ceo", "chairman", "cfo"):
        return jsonify({"error": "invalid role; must be CEO, Chairman or CFO"}), 400

    # Check duplicates
    if PaymentsAdminUser.query.filter_by(username=username).first():
        return jsonify({"error": "user_exists"}), 409
    try:
        ph = generate_password_hash(password)
        u = PaymentsAdminUser(username=username, password_hash=ph, role=role)
        db.session.add(u)
        db.session.commit()
        return jsonify({"success": True, "id": u.id, "username": u.username, "role": u.role}), 201
    except Exception as e:
        logger.exception("Failed to create PaymentsAdminUser: %s", e)
        db.session.rollback()
        return jsonify({"error": "create_failed", "detail": str(e)}), 500


@bp.route("/api/payments", methods=["GET"])
@require_payments_admin
def api_list_payments():
    if Payment is None:
        return jsonify({"error": "payments model not available"}), 500
    try:
        page = int(request.args.get("page", 1))
        per_page = min(int(request.args.get("per_page", 25)), 200)
    except Exception:
        page = 1
        per_page = 25

    q = Payment.query.order_by(Payment.created_at.desc())
    pagination = q.paginate(page=page, per_page=per_page, error_out=False)

    items = []
    for p in pagination.items:
        order = None
        if p.order_id and Order is not None:
            o = Order.query.get(p.order_id)
            if o:
                order = {
                    "id": o.id,
                    "order_number": o.order_number,
                    "customer_name": o.customer_name,
                    "customer_email": o.customer_email,
                    "status": o.status,
                    "total_amount": str(o.total_amount),
                    "currency": o.currency,
                }
        items.append({
            "id": p.id,
            "order_id": p.order_id,
            "provider": p.provider,
            "provider_order_id": p.provider_order_id,
            "provider_capture_id": p.provider_capture_id,
            "amount": str(p.amount),
            "currency": p.currency,
            "status": p.status,
            "payer_name": p.payer_name,
            "payer_email": p.payer_email,
            "payer_id": p.payer_id,
            "raw_response": p.raw_response,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "order": order
        })

    return jsonify({
        "items": items,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "total": pagination.total,
        "pages": pagination.pages
    })


@bp.route("/api/payments/<int:payment_id>", methods=["GET"])
@require_payments_admin
def api_payment_detail(payment_id: int):
    if Payment is None:
        return jsonify({"error": "payments model not available"}), 500
    p = Payment.query.get(payment_id)
    if not p:
        return jsonify({"error": "not_found"}), 404
    order = None
    if p.order_id and Order is not None:
        o = Order.query.get(p.order_id)
        if o:
            order = {
                "id": o.id,
                "order_number": o.order_number,
                "customer_name": o.customer_name,
                "customer_email": o.customer_email,
                "status": o.status,
                "total_amount": str(o.total_amount),
                "currency": o.currency,
            }
    resp = {
        "id": p.id,
        "order_id": p.order_id,
        "provider": p.provider,
        "provider_order_id": p.provider_order_id,
        "provider_capture_id": p.provider_capture_id,
        "amount": str(p.amount),
        "currency": p.currency,
        "status": p.status,
        "payer_name": p.payer_name,
        "payer_email": p.payer_email,
        "payer_id": p.payer_id,
        "raw_response": p.raw_response,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "order": order
    }
    return jsonify(resp)


@bp.route("/api/payments/<int:payment_id>/refund", methods=["POST"])
@require_payments_admin
def api_payment_refund(payment_id: int):
    """
    Initiate a refund for a captured PayPal payment.
    This will call PayPal Refund API server-side. Refund amount optional in JSON body:
      { "amount": "10.00", "currency": "USD", "note_to_payer": "text" }

    IMPORTANT: In production you should:
      - require an additional confirmation step (2nd factor)
      - record admin action in audit logs
      - ensure refund amounts and business rules are followed
    """
    if Payment is None:
        return jsonify({"error": "payments model not available"}), 500
    p = Payment.query.get(payment_id)
    if not p:
        return jsonify({"error": "not_found"}), 404

    if p.provider != "paypal":
        return jsonify({"error": "unsupported_provider", "detail": "refunds only supported for PayPal via this endpoint"}), 400

    # Extract capture id
    capture_id = p.provider_capture_id
    if not capture_id:
        return jsonify({"error": "no_capture_id", "detail": "payment record does not have a PayPal capture id"}), 400

    data = request.get_json(force=True, silent=True) or {}
    amount = data.get("amount")
    currency = data.get("currency") or p.currency or "USD"
    note_to_payer = data.get("note_to_payer") or ""

    # Build the payload for PayPal refund endpoint
    refund_payload = {}
    if amount:
        refund_payload = {
            "amount": {
                "value": str(amount),
                "currency_code": currency
            },
            "note_to_payer": note_to_payer
        }

    # Ensure PayPal credentials exist
    if not get_paypal_access_token or not PAYPAL_BASE:
        return jsonify({"error": "paypal_not_configured", "detail": "PayPal server-side integration not available"}), 500

    try:
        token = get_paypal_access_token()
        url = f"{PAYPAL_BASE}/v2/payments/captures/{capture_id}/refund"
        headers = {"Authorization": f"Bearer {token}",
                   "Content-Type": "application/json"}
        r = requests.post(url, headers=headers,
                          json=refund_payload, timeout=20)
        r.raise_for_status()
        js = r.json()

        # Persist refund info in raw_response (append)
        try:
            p.raw_response = (p.raw_response or {})
            p.raw_response.setdefault("_refunds", []).append(js)
            p.status = "refunded"
            db.session.add(p)
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception(
                "Failed to persist refund info for payment %s", p.id)

        return jsonify({"status": "refund_initiated", "refund_response": js})
    except requests.HTTPError as exc:
        logger.exception(
            "PayPal refund HTTP error for capture %s: %s", capture_id, exc)
        try:
            return jsonify({"error": "paypal_refund_failed", "detail": exc.response.json()}), 502
        except Exception:
            return jsonify({"error": "paypal_refund_failed", "detail": str(exc)}), 502
    except Exception as e:
        logger.exception(
            "Unexpected refund error for capture %s: %s", capture_id, e)
        return jsonify({"error": "refund_failed", "detail": str(e)}), 500
