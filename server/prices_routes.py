from flask import Blueprint, request, jsonify
from .utils.db import get_db_cursor

prices_bp = Blueprint('prices', __name__, url_prefix='/api')

@prices_bp.route('/price_quotes', methods=['GET'])
def get_price_quotes():
    """Return all price quotes, optionally filtered by ingredient_id."""
    ingredient_id = request.args.get('ingredient_id', type=int)
    limit = request.args.get('limit', type=int) or 100
    cursor = get_db_cursor()
    try:
        if ingredient_id:
            cursor.execute("""
                SELECT pq.*, i.name AS ingredient_name
                FROM price_quotes pq
                LEFT JOIN ingredients i ON pq.ingredient_id = i.ingredient_id
                WHERE pq.ingredient_id = %s
                ORDER BY pq.date_found DESC
                LIMIT %s
            """, (ingredient_id, limit))
        else:
            cursor.execute("""
                SELECT pq.*, i.name AS ingredient_name
                FROM price_quotes pq
                LEFT JOIN ingredients i ON pq.ingredient_id = i.ingredient_id
                ORDER BY pq.date_found DESC
                LIMIT %s
            """, (limit,))
        quotes = cursor.fetchall()
        return jsonify({"price_quotes": quotes})
    finally:
        cursor.close()

@prices_bp.route('/price_quotes', methods=['POST'])
def create_price_quote():
    data = request.get_json()
    required = ['ingredient_id', 'source', 'size_qty', 'size_unit', 'price']
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400
    cursor = get_db_cursor()
    try:
        cursor.execute("""
            INSERT INTO price_quotes (ingredient_id, source, size_qty, size_unit, price, date_found, notes, is_purchase)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            data['ingredient_id'],
            data['source'],
            data['size_qty'],
            data['size_unit'],
            data['price'],
            data.get('date_found'),
            data.get('notes'),
            data.get('is_purchase', False)
        ))
        new_quote = cursor.fetchone()
        return jsonify(new_quote), 201
    finally:
        cursor.close()

@prices_bp.route('/price_quotes/<int:quote_id>', methods=['PUT'])
def update_price_quote(quote_id):
    data = request.get_json()
    cursor = get_db_cursor()
    try:
        cursor.execute("""
            UPDATE price_quotes
            SET ingredient_id = %s, source = %s, size_qty = %s, size_unit = %s, price = %s, date_found = %s, notes = %s, is_purchase = %s
            WHERE id = %s
            RETURNING *
        """, (
            data['ingredient_id'],
            data['source'],
            data['size_qty'],
            data['size_unit'],
            data['price'],
            data.get('date_found'),
            data.get('notes'),
            data.get('is_purchase', False),
            quote_id
        ))
        updated = cursor.fetchone()
        if not updated:
            return jsonify({"error": "Quote not found"}), 404
        return jsonify(updated)
    finally:
        cursor.close()

@prices_bp.route('/ingredient_cost/<int:ingredient_id>', methods=['GET'])
def get_ingredient_cost(ingredient_id):
    unit = request.args.get('unit')
    qty = request.args.get('qty', type=float) or 1.0
    from .utils.cost_resolver import resolve_ingredient_cost
    result = resolve_ingredient_cost(ingredient_id, unit, qty)
    return jsonify(result)

@prices_bp.route('/item_cost/<int:item_id>', methods=['GET'])
def get_item_cost(item_id):
    unit = request.args.get('unit')
    qty = request.args.get('qty', type=float) or 1.0
    from .utils.cost_resolver import resolve_item_cost
    result = resolve_item_cost(item_id, unit, qty)
    return jsonify(result)

# Optionally add DELETE, GET single quote, etc. as needed
