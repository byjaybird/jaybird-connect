from flask import Blueprint, request, jsonify
from .utils.db import get_db_cursor

conversions_bp = Blueprint('conversions', __name__, url_prefix='/api')

@conversions_bp.route('/ingredient_conversions', methods=['GET'])
def list_conversions():
    """List ingredient conversions.
    - If ingredient_id is provided, return conversions for that ingredient plus global conversions.
    - Otherwise, return all conversions.
    Always returns 200 with an array (empty if none found).
    """
    ingredient_id = request.args.get('ingredient_id', type=int)
    cursor = get_db_cursor()
    try:
        if ingredient_id:
            cursor.execute(
                """
                SELECT id, ingredient_id, from_unit, to_unit, factor, is_global
                FROM ingredient_conversions
                WHERE ingredient_id = %s OR is_global = TRUE
                ORDER BY is_global DESC, id ASC
                """,
                (ingredient_id,)
            )
        else:
            cursor.execute(
                """
                SELECT id, ingredient_id, from_unit, to_unit, factor, is_global
                FROM ingredient_conversions
                ORDER BY id ASC
                """
            )
        rows = cursor.fetchall()
        return jsonify(rows or [])
    finally:
        try:
            cursor.close()
        except Exception:
            pass

@conversions_bp.route('/ingredient_conversions', methods=['POST'])
def create_conversion():
    """Create a new ingredient conversion.
    Expected JSON body:
    { ingredient_id?: number, from_unit: str, to_unit: str, factor: number, is_global?: bool }
    If is_global is true, ingredient_id may be omitted/null.
    """
    data = request.get_json() or {}

    from_unit = (data.get('from_unit') or '').strip().lower()
    to_unit = (data.get('to_unit') or '').strip().lower()
    factor = data.get('factor')
    ingredient_id = data.get('ingredient_id')
    is_global = bool(data.get('is_global', False))

    # Basic validation
    if not from_unit or not to_unit:
        return jsonify({"error": "from_unit and to_unit are required"}), 400
    try:
        factor = float(factor)
    except Exception:
        return jsonify({"error": "factor must be a number"}), 400
    if factor <= 0:
        return jsonify({"error": "factor must be greater than 0"}), 400

    if not is_global:
        # For non-global conversions, require a valid ingredient_id
        try:
            ingredient_id = int(ingredient_id)
        except Exception:
            return jsonify({"error": "ingredient_id is required for non-global conversions"}), 400

    cursor = get_db_cursor()
    try:
        cursor.execute(
            """
            INSERT INTO ingredient_conversions (ingredient_id, from_unit, to_unit, factor, is_global)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, ingredient_id, from_unit, to_unit, factor, is_global
            """,
            (ingredient_id if not is_global else None, from_unit, to_unit, factor, is_global)
        )
        row = cursor.fetchone()
        return jsonify(row), 201
    finally:
        try:
            cursor.close()
        except Exception:
            pass

@conversions_bp.route('/ingredient_conversions/<int:conv_id>', methods=['DELETE'])
def delete_conversion(conv_id):
    """Delete an ingredient conversion by id."""
    cursor = get_db_cursor()
    try:
        cursor.execute(
            """
            DELETE FROM ingredient_conversions
            WHERE id = %s
            RETURNING id
            """,
            (conv_id,)
        )
        deleted = cursor.fetchone()
        if not deleted:
            return jsonify({"error": "Conversion not found"}), 404
        return jsonify({"status": "deleted", "id": deleted['id']})
    finally:
        try:
            cursor.close()
        except Exception:
            pass
