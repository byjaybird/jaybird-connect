from flask import Blueprint, request, jsonify
from .utils.db import get_db_cursor
import logging

sales_mappings_bp = Blueprint('sales_mappings', __name__, url_prefix='/api')

@sales_mappings_bp.route('/sales/mappings', methods=['GET'])
def list_mappings():
    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT * FROM sales_item_mappings ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return jsonify(rows)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_mappings_bp.route('/sales/mappings', methods=['POST'])
def create_mapping():
    data = request.get_json() or {}
    sales_name = data.get('sales_name')
    item_id = data.get('item_id')
    if not sales_name or not item_id:
        return jsonify({'error': 'sales_name and item_id required'}), 400
    cursor = get_db_cursor()
    try:
        norm = sales_name.strip().lower()
        try:
            # Check if a mapping already exists for this normalized name
            cursor.execute("SELECT mapping_id, item_id FROM sales_item_mappings WHERE normalized = %s LIMIT 1", (norm,))
            existing = cursor.fetchone()
            if existing:
                # Update existing mapping
                cursor.execute(
                    "UPDATE sales_item_mappings SET sales_name = %s, item_id = %s, updated_at = now() WHERE mapping_id = %s RETURNING mapping_id",
                    (sales_name, item_id, existing.get('mapping_id'))
                )
                row = cursor.fetchone()
            else:
                cursor.execute(
                    "INSERT INTO sales_item_mappings (sales_name, normalized, item_id) VALUES (%s, %s, %s) RETURNING mapping_id",
                    (sales_name, norm, item_id)
                )
                row = cursor.fetchone()

            try:
                cursor.connection.commit()
            except Exception:
                pass
            logging.info("Saved sales mapping: %s -> %s", norm, item_id)
            return jsonify({'status': 'ok', 'mapping_id': row.get('mapping_id')})
        except Exception as e:
            try:
                cursor.connection.rollback()
            except Exception:
                pass
            logging.exception("Failed to create/update sales mapping for %s -> %s", sales_name, item_id)
            return jsonify({'error': str(e)}), 500
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_mappings_bp.route('/sales/mappings/<int:mapping_id>', methods=['DELETE'])
def delete_mapping(mapping_id):
    cursor = get_db_cursor()
    try:
        cursor.execute("DELETE FROM sales_item_mappings WHERE mapping_id = %s", (mapping_id,))
        return jsonify({'status': 'ok'})
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_mappings_bp.route('/sales/reconcile', methods=['POST'])
def reconcile_sales_mappings():
    """Apply mappings to existing sales_daily_lines rows where item_id is NULL.
    Optional JSON body:
      { "business_date": "YYYY-MM-DD" }
      or { "upload_id": <id> }
    Returns number of rows updated.
    """
    data = request.get_json() or {}
    business_date = data.get('business_date')
    upload_id = data.get('upload_id')
    cursor = get_db_cursor()
    try:
        if upload_id is not None:
            cursor.execute(
                """
                UPDATE sales_daily_lines s
                SET item_id = m.item_id
                FROM sales_item_mappings m
                WHERE s.item_id IS NULL
                AND lower(trim(s.item_name)) = m.normalized
                AND s.upload_id = %s
                RETURNING s.id
                """,
                (upload_id,)
            )
        elif business_date:
            cursor.execute(
                """
                UPDATE sales_daily_lines s
                SET item_id = m.item_id
                FROM sales_item_mappings m
                WHERE s.item_id IS NULL
                AND lower(trim(s.item_name)) = m.normalized
                AND s.business_date = %s
                RETURNING s.id
                """,
                (business_date,)
            )
        else:
            cursor.execute(
                """
                UPDATE sales_daily_lines s
                SET item_id = m.item_id
                FROM sales_item_mappings m
                WHERE s.item_id IS NULL
                AND lower(trim(s.item_name)) = m.normalized
                RETURNING s.id
                """
            )
        rows = cursor.fetchall()
        count = len(rows) if rows else 0
        return jsonify({'status': 'ok', 'updated': count})
    finally:
        try:
            cursor.close()
        except Exception:
            pass
