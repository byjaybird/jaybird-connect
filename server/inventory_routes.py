from flask import Blueprint, request, jsonify
from .utils.db import get_db_cursor
from .utils.conversion_helper import convert_to_base
import traceback

inventory_bp = Blueprint('inventory', __name__)

@inventory_bp.route('/api/inventory/upload-scan', methods=['POST'])
def upload_scan():
    """Accepts a list of scan objects similar to the scanner flow.
    Each scan may include: barcode (optional), quantity, unit (optional), source_type, source_id, location (optional)
    This will convert quantity to base units (if possible) and insert into inventory_count_entries.
    """
    scans = request.json or []

    cursor = get_db_cursor()
    try:
        for scan in scans:
            barcode = scan.get('barcode') or None
            quantity = scan.get('quantity')
            source_type = scan.get('source_type')
            source_id = scan.get('source_id')
            unit = scan.get('unit') or 'unit_from_scan'
            location = scan.get('location') or 'location_from_request'

            try:
                quantity_base, base_unit = convert_to_base(source_id, source_type, unit, quantity)
            except Exception as e:
                print(f"Conversion error: {e}")  # Debug log
                quantity_base = quantity
                base_unit = unit or 'unit_from_scan'

            user_id = getattr(request, 'user', None)
            if user_id and getattr(user_id, 'id', None):
                uid = request.user.id
            else:
                uid = 1

            cursor.execute('''
                INSERT INTO inventory_count_entries
                (source_type, source_id, quantity, unit, quantity_base, base_unit, barcode, location, created_at, user_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s)
            ''', (source_type, source_id, quantity, unit, quantity_base, base_unit, barcode, location, uid))

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


# Batch endpoint: accept JSON { items: [{ source_type, source_id }, ...] }
@inventory_bp.route('/api/inventory/current/batch', methods=['POST'])
def current_inventory_batch():
    data = request.json or {}
    items = data.get('items')

    if not items or not isinstance(items, list):
        return jsonify({'error': 'Missing or invalid items list'}), 400

    # Build list of unique pairs while preserving order
    seen = set()
    unique_pairs = []
    for it in items:
        st = it.get('source_type')
        sid = it.get('source_id')
        key = f"{st}::{sid}"
        if key not in seen:
            seen.add(key)
            unique_pairs.append((st, sid))

    if not unique_pairs:
        return jsonify({'results': []}), 200

    cursor = get_db_cursor()
    try:
        # Build WHERE clause with AND/OR pairs and use a window function to pick latest per pair
        pair_conditions = []
        params = []
        for st, sid in unique_pairs:
            pair_conditions.append('(source_type = %s AND source_id = %s)')
            params.extend([st, sid])

        where_clause = ' OR '.join(pair_conditions)

        query = f'''
            SELECT source_type, source_id, quantity, quantity_base, base_unit, unit, location, created_at, user_id FROM (
                SELECT source_type, source_id, quantity, quantity_base, base_unit, unit, location, created_at, user_id,
                       ROW_NUMBER() OVER (PARTITION BY source_type, source_id ORDER BY created_at DESC) AS rn
                FROM inventory_count_entries
                WHERE {where_clause}
            ) t
            WHERE rn = 1
        '''

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        # Build lookup
        lookup = {f"{r['source_type']}-{r['source_id']}": r for r in rows}

        results = []
        for st, sid in unique_pairs:
            key = f"{st}-{sid}"
            results.append({
                'source_type': st,
                'source_id': sid,
                'found': key in lookup,
                'data': lookup.get(key)
            })

        return jsonify({'results': results}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Database error', 'details': str(e)}), 500
    finally:
        cursor.close()


@inventory_bp.route('/api/inventory/expected/batch', methods=['POST'])
def expected_inventory_batch():
    """Return expected quantities for a batch of items based on received goods and adjustments.
    Accepts JSON: { items: [{ source_type, source_id }], start_date, end_date }
    Currently computes expected for source_type == 'ingredient' by summing received_goods and applying inventory_adjustments.
    Returns: { results: [{ source_type, source_id, found, data: { quantity_base, base_unit } }] }
    """
    data = request.json or {}
    items = data.get('items')
    start_date = data.get('start_date')
    end_date = data.get('end_date')

    if not items or not isinstance(items, list):
        return jsonify({'error': 'Missing or invalid items list'}), 400

    # collect unique ingredient ids
    ingredient_ids = [it.get('source_id') for it in items if it.get('source_type') == 'ingredient']
    ingredient_ids = list(dict.fromkeys([iid for iid in ingredient_ids if iid is not None]))

    results_map = {}
    for it in items:
        key = f"{it.get('source_type')}-{it.get('source_id')}"
        results_map[key] = {'source_type': it.get('source_type'), 'source_id': it.get('source_id'), 'found': False, 'data': None}

    cursor = get_db_cursor()
    try:
        # Sum received goods per ingredient by converting each row to base unit
        if ingredient_ids:
            # Build query
            params = [ingredient_ids]
            query = "SELECT ingredient_id, units, unit_type, receive_date FROM received_goods WHERE ingredient_id = ANY(%s)"
            if start_date:
                query += " AND receive_date >= %s"
                params.append(start_date)
            if end_date:
                query += " AND receive_date <= %s"
                params.append(end_date)
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()

            totals = {}
            for r in rows:
                iid = r.get('ingredient_id')
                units = r.get('units')
                unit_type = r.get('unit_type')
                try:
                    qty_base, base_unit = convert_to_base(iid, 'ingredient', unit_type, units)
                except Exception:
                    # if conversion fails, skip
                    continue
                totals.setdefault(iid, {'quantity_base': 0, 'base_unit': base_unit})
                try:
                    totals[iid]['quantity_base'] += float(qty_base)
                except Exception:
                    try:
                        totals[iid]['quantity_base'] += float(str(qty_base))
                    except Exception:
                        pass

            # Include adjustments (stored with quantity_base)
            # Query adjustments for these ingredients
            adj_query = "SELECT source_id, quantity_base, adjustment_type FROM inventory_adjustments WHERE source_type = 'ingredient' AND source_id = ANY(%s)"
            adj_params = [ingredient_ids]
            if start_date:
                adj_query += " AND created_at >= %s"
                adj_params.append(start_date)
            if end_date:
                adj_query += " AND created_at <= %s"
                adj_params.append(end_date)
            cursor.execute(adj_query, tuple(adj_params))
            adj_rows = cursor.fetchall()
            for a in adj_rows:
                sid = a.get('source_id')
                qbase = a.get('quantity_base') or 0
                atype = (a.get('adjustment_type') or '').lower()
                sign = -1 if atype in ('remove', 'decrease', 'decrement', 'out') else 1
                totals.setdefault(sid, {'quantity_base': 0, 'base_unit': None})
                try:
                    totals[sid]['quantity_base'] += float(qbase) * sign
                except Exception:
                    try:
                        totals[sid]['quantity_base'] += float(str(qbase)) * sign
                    except Exception:
                        pass

            # Populate results_map
            for iid, val in totals.items():
                key = f"ingredient-{iid}"
                results_map[key] = {'source_type': 'ingredient', 'source_id': iid, 'found': True, 'data': { 'quantity_base': val.get('quantity_base', 0), 'base_unit': val.get('base_unit') or 'unit' }}

        # Return results in original requested order
        results = [results_map[f"{it.get('source_type')}-{it.get('source_id')}"] for it in items]
        return jsonify({'results': results}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Database error', 'details': str(e)}), 500
    finally:
        cursor.close()
