from flask import Blueprint, request, jsonify

"""
Blueprint: top_picks_bp
Temporary in-memory Top Picks CRUD and push endpoint used by admin/front-end.

Endpoints:
- GET    /api/top-picks             -> list of top-picks
- POST   /api/top-picks             -> create a new top-pick (returns id)
- GET    /api/top-picks/<tp_id>     -> retrieve single top-pick
- PUT    /api/top-picks/<tp_id>     -> update top-pick
- DELETE /api/top-picks/<tp_id>     -> delete top-pick
- POST   /api/top-picks/<tp_id>/push-> mark top-pick as pushed (boolean)
Note: storage is in-memory (TOP_PICKS list) and will reset on server restart.
"""

top_picks_bp = Blueprint("top_picks_bp", __name__)

# In-memory store (temporary). Replace with DB-backed model for persistence.
# each item: dict { id, product_id, product_title, brand, tags:list, rank:int, pushed:bool, sales_count:int }
TOP_PICKS = []


def _find_index(tp_id):
    for i, tp in enumerate(TOP_PICKS):
        if str(tp.get("id")) == str(tp_id):
            return i
    return None


@top_picks_bp.route("/api/top-picks", methods=["GET"])
def list_top_picks():
    return jsonify(TOP_PICKS)


@top_picks_bp.route("/api/top-picks", methods=["POST"])
def add_top_pick():
    data = request.get_json(silent=True) or {}
    new_id = str(len(TOP_PICKS) + 1)
    tp = {
        "id": new_id,
        "product_id": data.get("product_id"),
        "product_title": data.get("product_title"),
        "brand": data.get("brand"),
        "tags": data.get("tags") if isinstance(data.get("tags"), list) else (data.get("tags") or []),
        "rank": int(data.get("rank", 0)),
        "pushed": bool(data.get("pushed", False)),
        "sales_count": int(data.get("sales_count", 0)),
    }
    TOP_PICKS.append(tp)
    return jsonify({"success": True, "id": new_id}), 201


@top_picks_bp.route("/api/top-picks/<tp_id>", methods=["GET"])
def get_top_pick(tp_id):
    idx = _find_index(tp_id)
    if idx is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(TOP_PICKS[idx])


@top_picks_bp.route("/api/top-picks/<tp_id>", methods=["PUT"])
def update_top_pick(tp_id):
    idx = _find_index(tp_id)
    if idx is None:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    tp = TOP_PICKS[idx]
    tp.update({
        "product_id": data.get("product_id", tp.get("product_id")),
        "product_title": data.get("product_title", tp.get("product_title")),
        "brand": data.get("brand", tp.get("brand")),
        "tags": data.get("tags") if isinstance(data.get("tags"), list) else (data.get("tags") or tp.get("tags", [])),
        "rank": int(data.get("rank", tp.get("rank", 0))),
        "pushed": bool(data.get("pushed", tp.get("pushed", False))),
        "sales_count": int(data.get("sales_count", tp.get("sales_count", 0))),
    })
    return jsonify({"success": True})


@top_picks_bp.route("/api/top-picks/<tp_id>", methods=["DELETE"])
def delete_top_pick(tp_id):
    idx = _find_index(tp_id)
    if idx is None:
        return jsonify({"error": "Not found"}), 404
    TOP_PICKS.pop(idx)
    return jsonify({"success": True})


@top_picks_bp.route("/api/top-picks/<tp_id>/push", methods=["POST"])
def push_top_pick(tp_id):
    idx = _find_index(tp_id)
    if idx is None:
        return jsonify({"error": "Not found"}), 404
    TOP_PICKS[idx]["pushed"] = True
    return jsonify({"success": True})
