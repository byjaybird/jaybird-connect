from flask import Blueprint, request, jsonify
from .utils.db import get_db_cursor
from .utils.conversion_helper import convert_to_base
import traceback

receiving_bp = Blueprint('receiving', __name__, url_prefix='/api')

@receiving_bp.route('/receiving', methods=['POST'])
def submit_receiving():
    data = request.json

    try:
        receive_date = data.get('receiveDate')
        supplier = data.get('supplier')
        items = data.get('items')
        with get_db_cursor() as cursor:
            for item in items:
                ingredient_id = item.get('ingredientId')
                units = item.get('units')
                unit_type = item.get('unitType')
                price_per_unit = item.get('pricePerUnit')

                cursor.execute("""
                    INSERT INTO received_goods (receive_date, supplier, ingredient_id, units, unit_type, price_per_unit)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (receive_date, supplier, ingredient_id, units, unit_type, price_per_unit))

            for item in items:
                cursor.execute("""
                    INSERT INTO price_quotes (
                        ingredient_id, source, size_qty, size_unit, price,
                        date_found, is_purchase
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, TRUE
                    )
                """, (
                    item.get('ingredientId'),
                    supplier,
                    float(item.get('units')),
                    item.get('unitType'),
                    float(item.get('pricePerUnit')),
                    receive_date
                ))

        return jsonify({"status": "success"}), 201

    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@receiving_bp.route('/purchases/daily_agg', methods=['GET'])
def purchases_daily_agg():
    """Return aggregated purchases for a given receive_date grouped by ingredient."""
    receive_date = request.args.get('receive_date')
    if not receive_date:
        return jsonify({'error': 'receive_date required'}), 400
    cursor = get_db_cursor()
    try:
        cursor.execute(
            """
            SELECT rg.ingredient_id,
                   COALESCE(i.name, '') AS ingredient_name,
                   SUM(rg.units) AS total_units,
                   SUM(COALESCE(rg.units, 0) * COALESCE(rg.price_per_unit, 0)) AS total_cost
            FROM received_goods rg
            LEFT JOIN ingredients i ON rg.ingredient_id = i.ingredient_id
            WHERE rg.receive_date = %s
            GROUP BY rg.ingredient_id, i.name
            ORDER BY total_cost DESC
            """,
            (receive_date,)
        )
        rows = cursor.fetchall()
        return jsonify(rows)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@receiving_bp.route('/purchases/recent', methods=['GET'])
def purchases_recent():
    """Return recent received goods rows (with ingredient name)"""
    limit = int(request.args.get('limit', 50))
    cursor = get_db_cursor()
    try:
        cursor.execute(
            """
            SELECT rg.*, COALESCE(i.name, '') AS ingredient_name
            FROM received_goods rg
            LEFT JOIN ingredients i ON rg.ingredient_id = i.ingredient_id
            ORDER BY rg.receive_date DESC, rg.id DESC
            LIMIT %s
            """,
            (limit,)
        )
        rows = cursor.fetchall()
        return jsonify(rows)
    finally:
        try:
            cursor.close()
        except Exception:
            pass
