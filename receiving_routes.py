from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor
from utils.conversion_helper import convert_to_base
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

