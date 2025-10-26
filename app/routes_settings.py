# app/routes_settings.py
from flask import Blueprint, request, jsonify, current_app, session
from .models import Setting
from . import db
import json

settings_bp = Blueprint("settings_bp", __name__)


@settings_bp.route("/api/settings/checkout_discount", methods=["GET"])
def get_checkout_discount():
    """
    Return JSON: { "percent": 2.5 }
    Public endpoint (frontend reads it to show advert).
    """
    s = Setting.query.get("checkout_discount")
    try:
        percent = float(s.value) if s and s.value is not None else 0.0
    except Exception:
        percent = 0.0
    return jsonify({"percent": percent})


@settings_bp.route("/api/settings/checkout_discount", methods=["PUT"])
def update_checkout_discount():
    """
    Accept JSON body { "percent": <number> }.
    Requires admin session (session['user'] == 'admin' or admin@example.com).
    """
    if session.get("user") not in ("admin", "admin@example.com"):
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    try:
        percent = float(data.get("percent", 0))
    except Exception:
        return jsonify({"error": "Invalid percent value"}), 400

    if percent < 0 or percent > 100:
        return jsonify({"error": "Percent must be between 0 and 100"}), 400

    s = Setting.query.get("checkout_discount")
    if not s:
        s = Setting(key="checkout_discount", value=str(percent))
        db.session.add(s)
    else:
        s.value = str(percent)
    db.session.commit()
    return jsonify({"success": True, "percent": percent})


# -----------------------
# Price comparison settings
# -----------------------
# Stored as Setting.key = 'price_comparison_competitors' with JSON string value.
# The admin UI produces a list of entries like:
#   { "name": "...", "product_id": "PRD001", "our_price": 350, "competitor_price": 400, "margin": 2.5 }
# We validate and persist that structure here.
# -----------------------


@settings_bp.route("/api/settings/price_comparison", methods=["GET"])
def get_price_comparison_settings():
    """
    Return JSON:
    {
      "competitors": [ {name, product_id, our_price?, competitor_price?, margin?}, ... ],
      "global_margin": <number>
    }
    """
    try:
        s = Setting.query.get("price_comparison_competitors")
        competitors = []
        if s and s.value:
            try:
                competitors = json.loads(s.value)
            except Exception:
                current_app.logger.debug(
                    "Invalid JSON in price_comparison_competitors setting")
                competitors = []
        gm = Setting.query.get("price_comparison_global_margin")
        global_margin = float(gm.value) if gm and gm.value is not None else 0.0
        return jsonify({"competitors": competitors, "global_margin": global_margin})
    except Exception as e:
        current_app.logger.exception(
            "Failed to read price comparison settings")
        return jsonify({"error": "failed to read settings", "detail": str(e)}), 500


@settings_bp.route("/api/settings/price_comparison", methods=["PUT"])
def update_price_comparison_settings():
    """
    Accept JSON body: { "competitors": [...], "global_margin": <number> }
    Requires admin session.
    We require that each entry contains at least 'name' and 'product_id'.
    Numeric fields (our_price, competitor_price, margin) are coerced to floats when possible.
    """
    if session.get("user") not in ("admin", "admin@example.com"):
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    competitors = data.get("competitors", [])
    global_margin = data.get("global_margin", None)

    try:
        if not isinstance(competitors, list):
            return jsonify({"error": "competitors must be a list"}), 400

        cleaned = []
        for c in competitors:
            if not isinstance(c, dict):
                continue
            name = (c.get("name") or "").strip()
            product_id = (c.get("product_id") or "").strip()
            # enforce required fields
            if not name or not product_id:
                continue

            def to_float_maybe(v):
                if v is None or v == "":
                    return None
                try:
                    return float(v)
                except Exception:
                    return None

            our_price = to_float_maybe(c.get("our_price"))
            competitor_price = to_float_maybe(
                c.get("competitor_price") or c.get("manual_price"))
            margin = to_float_maybe(c.get("margin"))

            cleaned.append({
                "name": name,
                "product_id": product_id,
                "our_price": our_price,
                "competitor_price": competitor_price,
                "margin": margin
            })

        # save competitors JSON
        s = Setting.query.get("price_comparison_competitors")
        if not s:
            s = Setting(key="price_comparison_competitors",
                        value=json.dumps(cleaned))
            db.session.add(s)
        else:
            s.value = json.dumps(cleaned)

        # save optional global margin
        if global_margin is not None:
            try:
                gm_val = float(global_margin)
            except Exception:
                return jsonify({"error": "global_margin must be a number"}), 400
            gm = Setting.query.get("price_comparison_global_margin")
            if not gm:
                gm = Setting(key="price_comparison_global_margin",
                             value=str(gm_val))
                db.session.add(gm)
            else:
                gm.value = str(gm_val)

        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        current_app.logger.exception(
            "Failed to save price comparison settings")
        return jsonify({"error": "failed to save", "detail": str(e)}), 500


@settings_bp.route("/api/settings/price_comparison/push", methods=["POST"])
def push_price_comparison_settings():
    """
    Small helper endpoint used by admin UI after save.
    For now it simply returns success and logs; provides a stable endpoint admin.js expects.
    """
    # admin guard
    if session.get("user") not in ("admin", "admin@example.com"):
        return jsonify({"error": "Unauthorized"}), 401
    # For future: this could trigger a cache refresh / re-publish step.
    current_app.logger.info(
        "Price comparison push triggered by admin user %s", session.get("user"))
    return jsonify({"success": True})
