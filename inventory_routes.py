from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor
from utils.conversion_helper import convert_to_base
import traceback

inventory_bp = Blueprint('inventory', __name__)

@inventory_bp.route('/api/inventory/upload-scan', methods=['POST'])
def upload_scan():
    scans = request.json
    unresolved_barcodes = []

    cursor = get_db_cursor()
    try:
        for scan in scans:
            barcode = scan.get('barcode')
            quantity = scan.get('quantity')
            source_type = scan.get('source_type')
            source_id = scan.get('source_id')

            try:
                quantity_base, base_unit = convert_to_base(source_id, source_type, 'unit_from_scan', quantity)
            except Exception as e:
                print(f"Conversion error: {e}")  # Debug log
                quantity_base = quantity
                base_unit = 'unit_from_scan'

            cursor.execute('''
                INSERT INTO inventory_count_entries
                (source_type, source_id, quantity, unit, quantity_base, base_unit, barcode, location, created_at, user_id)
                VALUES (%s, %s, %s, 'unit_from_scan', %s, %s, %s, 'location_from_request', NOW(), %s)
            ''', (source_type, source_id, quantity, quantity_base, base_unit, barcode, 1))  # Default user_id to 1 for now

        cursor.connection.commit()
    finally:
        cursor.close()

    return jsonify({'status': 'success'})

@inventory_bp.route('/api/inventory/unmapped-barcodes', methods=['GET'])
def unmapped_barcodes():
    cursor = get_db_cursor()
    try:
        cursor.execute('''
            SELECT DISTINCT barcode FROM inventory_count_entries
            WHERE source_id IS NULL OR source_type IS NULL
        ''')
        unmapped = cursor.fetchall()
    finally:
        cursor.close()

    return jsonify({'unmappedBarcodes': [row['barcode'] for row in unmapped]})

@inventory_bp.route('/api/barcode-map', methods=['POST'])
def barcode_map():
    data = request.json
    barcode = data.get('barcode')
    source_type = data.get('source_type')
    source_id = data.get('source_id')

    cursor = get_db_cursor()
    try:
        cursor.execute('''
            INSERT INTO barcode_map (barcode, source_type, source_id)
            VALUES (%s, %s, %s)
            ON CONFLICT (barcode)
            DO UPDATE SET source_type = %s, source_id = %s
        ''', (barcode, source_type, source_id, source_type, source_id))

        cursor.connection.commit()
    finally:
        cursor.close()

    return jsonify({'status': 'Mapping updated'})

@inventory_bp.route('/api/barcode-map', methods=['GET'])
def get_barcode_map():
    barcode = request.args.get('barcode')

    if not barcode:
        return jsonify({'error': 'Missing barcode parameter'}), 400

    cursor = get_db_cursor()
    try:
        cursor.execute('SELECT source_type, source_id FROM barcode_map WHERE barcode = %s', (barcode,))
        barcode_data = cursor.fetchone()

        if not barcode_data:
            return jsonify({
                'found': False,
                'error': 'Barcode not found',
                'barcode': barcode
            }), 200

        return jsonify({
            'found': True,
            'data': barcode_data
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Database error', 'details': str(e)}), 500
    finally:
        cursor.close()

# Batch lookup endpoint: accepts JSON { "barcodes": ["b1", "b2", ...] }
@inventory_bp.route('/api/barcode-map/batch', methods=['POST'])
def barcode_map_batch():
    data = request.json or {}
    barcodes = data.get('barcodes')

    if not barcodes or not isinstance(barcodes, list):
        return jsonify({'error': 'Missing or invalid barcodes list'}), 400

    # Preserve order and remove duplicates while keeping insertion order
    seen = set()
    unique_barcodes = []
    for b in barcodes:
        if b not in seen:
            seen.add(b)
            unique_barcodes.append(b)

    if not unique_barcodes:
        return jsonify({'mappings': {}}), 200

    cursor = get_db_cursor()
    try:
        # Build a parameterized IN clause safely
        placeholders = ','.join(['%s'] * len(unique_barcodes))
        query = f"SELECT barcode, source_type, source_id FROM barcode_map WHERE barcode IN ({placeholders})"
        cursor.execute(query, tuple(unique_barcodes))
        rows = cursor.fetchall()

        # Initialize result with not-found entries
        result = {b: {'found': False} for b in unique_barcodes}
        for r in rows:
            result[r['barcode']] = {
                'found': True,
                'data': {'source_type': r['source_type'], 'source_id': r['source_id']}
            }

        return jsonify({'mappings': result}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Database error', 'details': str(e)}), 500
    finally:
        cursor.close()

@inventory_bp.route('/api/inventory/adjustment', methods=['POST'])
def adjustment():
    data = request.json
    adjustment_type = data.get('adjustment_type')
    source_type = data.get('source_type')
    source_id = data.get('source_id')
    quantity = data.get('quantity')
    unit = data.get('unit')
    reason = data.get('reason')

    quantity_base, base_unit = convert_to_base(source_id, source_type, unit, quantity)

    cursor = get_db_cursor()
    try:
        cursor.execute('''
            INSERT INTO inventory_adjustments
            (adjustment_type, source_type, source_id, quantity, unit, quantity_base, base_unit, reason, created_at, user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s)
        ''', (adjustment_type, source_type, source_id, quantity, unit, quantity_base, base_unit, reason, request.user.id))

        cursor.connection.commit()
    finally:
        cursor.close()

    return jsonify({'status': 'Adjustment recorded'})

@inventory_bp.route('/api/inventory/current', methods=['GET'])
def current_inventory():
    location = request.args.get('location')
    source_type = request.args.get('source_type')

    cursor = get_db_cursor()
    conditions = []
    params = []

    if location:
        conditions.append('location = %s')
        params.append(location)
    if source_type:
        conditions.append('source_type = %s')
        params.append(source_type)

    query = 'SELECT * FROM inventory_count_entries'
    if conditions:
        query += f" WHERE {' AND '.join(conditions)}"
    query += ' ORDER BY created_at DESC'

    try:
        cursor.execute(query, params)
        rows = cursor.fetchall()
    finally:
        cursor.close()

    return jsonify(rows)