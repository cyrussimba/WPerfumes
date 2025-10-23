# app/payments_paypal.py
# Server-side PayPal integration (Sandbox / Production)
#
# - Reads PAYPAL_CLIENT_ID and PAYPAL_SECRET from environment variables.
# - Uses PAYPAL_MODE (sandbox|live) if set, otherwise falls back to FLASK_ENV heuristic.
# - Exposes routes (when the blueprint is registered under /paypal):
#     POST /create-paypal-order   -> create an order (returns PayPal order JSON)
#     POST /capture-paypal-order  -> capture an approved order and create internal orders
#     POST /webhook/paypal        -> receive and optionally verify PayPal webhooks
#     GET  /return                -> minimal client-side return page to finalize capture
#
# Usage: set PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_MODE (optional) and restart app.

import os
import time
import requests
from flask import Blueprint, request, jsonify, current_app, Response

# DO NOT set url_prefix here — register the blueprint with url_prefix="/paypal" in create_app.
paypal_bp = Blueprint("paypal", __name__)

# Configuration via environment variables
PAYPAL_CLIENT_ID = (os.getenv("PAYPAL_CLIENT_ID") or "").strip()
PAYPAL_SECRET = (os.getenv("PAYPAL_SECRET") or "").strip()
FLASK_ENV = os.getenv("FLASK_ENV", "development").lower()
# 'sandbox' or 'live' preferred
PAYPAL_MODE = (os.getenv("PAYPAL_MODE") or "").strip().lower()
PAYPAL_WEBHOOK_ID = (os.getenv("PAYPAL_WEBHOOK_ID") or "").strip()

# Determine base URL: prefer explicit PAYPAL_MODE, otherwise fallback to FLASK_ENV heuristic.
if PAYPAL_MODE == "live":
    PAYPAL_BASE = "https://api-m.paypal.com"
elif PAYPAL_MODE == "sandbox":
    PAYPAL_BASE = "https://api-m.sandbox.paypal.com"
else:
    PAYPAL_BASE = "https://api-m.sandbox.paypal.com" if FLASK_ENV != "production" else "https://api-m.paypal.com"

# Simple in-process token cache
_token_cache = {"access_token": None, "expires_at": 0}


class PayPalAuthError(Exception):
    pass


def _log_masked(msg, *args, **kwargs):
    try:
        current_app.logger.debug(msg, *args, **kwargs)
    except Exception:
        try:
            print(msg % args)
        except Exception:
            print(msg)


def _get_paypal_token():
    now = time.time()
    if _token_cache.get("access_token") and _token_cache.get("expires_at", 0) - 60 > now:
        return _token_cache["access_token"]

    if not PAYPAL_CLIENT_ID or not PAYPAL_SECRET:
        msg = "PayPal credentials are not set (PAYPAL_CLIENT_ID/PAYPAL_SECRET)."
        current_app.logger.error(msg)
        raise PayPalAuthError(msg)

    auth = (PAYPAL_CLIENT_ID, PAYPAL_SECRET)
    token_url = f"{PAYPAL_BASE}/v1/oauth2/token"
    headers = {"Accept": "application/json"}
    data = {"grant_type": "client_credentials"}

    try:
        resp = requests.post(token_url, auth=auth,
                             headers=headers, data=data, timeout=10)
    except requests.RequestException:
        current_app.logger.exception(
            "Network error when requesting PayPal token")
        raise

    # Debug: safe to log in development only
    current_app.logger.debug(
        "PayPal token request status=%s body=%s", resp.status_code, resp.text)

    if resp.status_code == 401:
        err_msg = "PayPal OAuth failed: 401 Unauthorized. Check PAYPAL_CLIENT_ID and PAYPAL_SECRET and sandbox/live consistency."
        current_app.logger.error(err_msg + " Response: %s", resp.text)
        raise PayPalAuthError(err_msg)

    try:
        resp.raise_for_status()
    except requests.HTTPError:
        current_app.logger.error(
            "PayPal token endpoint returned error status=%s body=%s", resp.status_code, resp.text)
        raise

    js = resp.json()
    access_token = js.get("access_token")
    expires_in = int(js.get("expires_in", 3300))
    if not access_token:
        current_app.logger.error(
            "PayPal token response missing access_token: %s", js)
        raise PayPalAuthError("Failed to obtain PayPal access token")

    _token_cache["access_token"] = access_token
    _token_cache["expires_at"] = now + expires_in
    current_app.logger.debug(
        "PayPal access token retrieved and cached (expires_in=%s)", expires_in)
    return access_token


@paypal_bp.route("/create-paypal-order", methods=["POST"])
def create_paypal_order():
    payload = request.json or {}
    items = payload.get("items", []) or []
    currency = (payload.get("currency") or "USD").upper()

    total = 0.0
    purchase_items = []
    for it in items:
        try:
            price = float(it.get("unit_price") or 0)
        except Exception:
            price = 0.0
        try:
            qty = int(it.get("quantity") or it.get("qty") or 1)
        except Exception:
            qty = 1
        total += price * qty
        purchase_items.append({
            "name": (it.get("title") or it.get("name") or "Item")[:127],
            "unit_amount": {"currency_code": currency, "value": f"{price:.2f}"},
            "quantity": str(qty)
        })

    default_return = payload.get("return_url") or (
        request.host_url.rstrip("/") + "/paypal/return")
    default_cancel = payload.get("cancel_url") or (
        request.host_url.rstrip("/") + "/paypal/cancel")

    body = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "amount": {
                "currency_code": currency,
                "value": f"{total:.2f}",
                "breakdown": {"item_total": {"currency_code": currency, "value": f"{total:.2f}"}}
            },
            "items": purchase_items
        }],
        "application_context": {
            "brand_name": payload.get("brand_name", "Your Store"),
            "landing_page": "NO_PREFERENCE",
            "user_action": "PAY_NOW",
            "return_url": default_return,
            "cancel_url": default_cancel
        }
    }

    try:
        token = _get_paypal_token()
    except PayPalAuthError as e:
        _token_cache["access_token"] = None
        current_app.logger.error(
            "PayPal auth error while creating order: %s", str(e))
        return jsonify({"error": "PayPal authentication failed", "detail": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("Unexpected error obtaining PayPal token")
        return jsonify({"error": "Failed to obtain PayPal token", "detail": str(e)}), 400

    headers = {"Authorization": f"Bearer {token}",
               "Content-Type": "application/json"}
    orders_url = f"{PAYPAL_BASE}/v2/checkout/orders"

    try:
        r = requests.post(orders_url, json=body, headers=headers, timeout=15)
    except requests.RequestException as e:
        current_app.logger.exception(
            "Network error when creating PayPal order")
        return jsonify({"error": "Network error contacting PayPal", "detail": str(e)}), 400

    current_app.logger.debug(
        "PayPal create order status=%s body=%s", r.status_code, r.text)

    if not r.ok:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        current_app.logger.error(
            "PayPal create order failed: status=%s detail=%s", r.status_code, detail)
        return jsonify({"error": "Failed to create PayPal order", "status": r.status_code, "detail": detail}), 400

    try:
        return jsonify(r.json())
    except Exception as e:
        current_app.logger.exception(
            "Failed to parse PayPal create order response JSON")
        return jsonify({"error": "Invalid response from PayPal", "detail": str(e)}), 500


@paypal_bp.route("/capture-paypal-order", methods=["POST"])
def capture_paypal_order():
    body = request.json or {}
    order_id = body.get("orderID") or body.get("token") or body.get("orderId")
    if not order_id:
        return jsonify({"error": "orderID is required"}), 400

    try:
        token = _get_paypal_token()
    except PayPalAuthError as e:
        _token_cache["access_token"] = None
        current_app.logger.error(
            "PayPal auth error during capture: %s", str(e))
        return jsonify({"error": "PayPal authentication failed", "detail": str(e)}), 400
    except Exception as e:
        current_app.logger.exception(
            "Unexpected error obtaining PayPal token during capture")
        return jsonify({"error": "Failed to obtain PayPal token", "detail": str(e)}), 400

    headers = {"Authorization": f"Bearer {token}",
               "Content-Type": "application/json"}
    capture_url = f"{PAYPAL_BASE}/v2/checkout/orders/{order_id}/capture"

    try:
        r = requests.post(capture_url, headers=headers, timeout=15)
    except requests.RequestException as e:
        current_app.logger.exception(
            "Network error when capturing PayPal order")
        return jsonify({"error": "Network error contacting PayPal", "detail": str(e)}), 400

    current_app.logger.debug(
        "PayPal capture status=%s body=%s", r.status_code, r.text)

    if not r.ok:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        current_app.logger.error("PayPal capture failed: %s", detail)
        return jsonify({"error": "Capture failed", "status": r.status_code, "detail": detail}), 400

    capture_js = r.json()

    captures = []
    completed = False
    for pu in capture_js.get("purchase_units", []):
        payments = pu.get("payments", {})
        for c in payments.get("captures", []):
            captures.append(c)
            if c.get("status") == "COMPLETED":
                completed = True

    if not captures:
        current_app.logger.warning(
            "No captures found in PayPal response for order %s", order_id)

    if not completed:
        return jsonify({"error": "Capture not completed", "capture": capture_js}), 400

    # Create internal orders (best-effort): POST to internal /api/orders endpoint
    created = []
    failed = []
    items = body.get("items", [])
    customer = body.get("customer", {}) or {}
    promo_code = body.get("promo_code")
    the_date = body.get("date") or time.strftime("%Y-%m-%d %H:%M:%S")
    api_base = request.host_url.rstrip("/") + "/api"

    # TODO: Add server-side verification of amounts / idempotency check here
    for item in items:
        order_payload = {
            "customer_name": customer.get("name") or customer.get("customer_name") or "",
            "customer_email": customer.get("email") or "",
            "customer_phone": customer.get("phone") or "",
            "customer_address": customer.get("address") or "",
            "product_id": item.get("id") or item.get("product_id") or "",
            "product_title": item.get("title") or item.get("name") or "",
            "quantity": int(item.get("quantity") or item.get("qty") or 1),
            "status": "Paid",
            "payment_method": "PayPal",
            "date": the_date,
            "payment_reference": captures[0].get("id") if captures else order_id
        }
        if promo_code:
            order_payload["promo_code"] = promo_code
        try:
            resp = requests.post(f"{api_base}/orders",
                                 json=order_payload, timeout=10)
            if resp.ok:
                created.append(order_payload)
            else:
                failed.append({"payload": order_payload,
                              "status": resp.status_code, "text": resp.text})
        except Exception as e:
            current_app.logger.exception("Failed to POST /api/orders")
            failed.append({"payload": order_payload, "error": str(e)})

    return jsonify({"capture": capture_js, "orders_created": len(created), "orders_failed": failed})


@paypal_bp.route("/webhook/paypal", methods=["POST"])
def paypal_webhook():
    data = request.json or {}
    headers = {k.lower(): v for k, v in request.headers.items()}

    if PAYPAL_WEBHOOK_ID:
        try:
            token = _get_paypal_token()
            verify_body = {
                "auth_algo": headers.get("paypal-auth-algo"),
                "cert_url": headers.get("paypal-cert-url"),
                "transmission_id": headers.get("paypal-transmission-id"),
                "transmission_sig": headers.get("paypal-transmission-sig"),
                "transmission_time": headers.get("paypal-transmission-time"),
                "webhook_id": PAYPAL_WEBHOOK_ID,
                "webhook_event": data
            }
            verify_resp = requests.post(
                f"{PAYPAL_BASE}/v1/notifications/verify-webhook-signature",
                headers={"Authorization": f"Bearer {token}",
                         "Content-Type": "application/json"},
                json=verify_body, timeout=10
            )
            verify_resp.raise_for_status()
            res_js = verify_resp.json()
            if res_js.get("verification_status") != "SUCCESS":
                current_app.logger.warning(
                    "PayPal webhook verification failed: %s", res_js)
                return jsonify({"error": "webhook verification failed", "detail": res_js}), 400
        except Exception as e:
            current_app.logger.exception("PayPal webhook verification error")
            return jsonify({"error": "verification error", "detail": str(e)}), 400

    event_type = data.get("event_type")
    current_app.logger.info("PayPal webhook event received: %s", event_type)
    # TODO: persist webhook events for reconciliation
    return jsonify({"status": "ok"}), 200


@paypal_bp.route("/return", methods=["GET"])
def paypal_return_page():
    html = """<!doctype html>..."""  # unchanged HTML omitted for brevity (use your existing return page)
    return Response(html, mimetype="text/html")
