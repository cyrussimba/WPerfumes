# app/routes_settings.py
from flask import Blueprint, request, jsonify, current_app, session
from .models import Setting
from . import db

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
    # simple session-based admin guard (matches app auth in routes.py)
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
