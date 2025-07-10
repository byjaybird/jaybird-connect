from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor
from utils.conversion_helper import convert_to_base
import traceback

receiving_bp = Blueprint('receiving', __name__)

@receiving_bp.route('/submit-receiving', methods=['POST'])
def submit_receiving():
    data = request.json

    try:
        # Extract data from the incoming JSON
        receive_date = data.get('receiveDate')
        supplier = data.get('supplier')
        items = data.get('items')  # Assuming `items` is a list of dictionaries

        # Database connection and insertion logic
        with get_db_cursor() as cursor:
            for item in items:
                ingredient_id = item.get('ingredientId')
                units = item.get('units')
                unit_type = item.get('unitType')
                price_per_unit = item.get('pricePerUnit')

                # Execute insertion
                cursor.execute("""
                    INSERT INTO received_goods (receive_date, supplier, ingredient_id, units, unit_type, price_per_unit)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (receive_date, supplier, ingredient_id, units, unit_type, price_per_unit))
        return jsonify({"status": "success"}), 201

    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
