from collections import defaultdict
from datetime import datetime, timedelta, timezone, date
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
    """Return inventory_count_entries filtered by optional query params.
    Supports: location, source_type, source_id.
    """
    location = request.args.get('location')
    source_type = request.args.get('source_type')
    source_id = request.args.get('source_id')

    cursor = get_db_cursor()
    conditions = []
    params = []

    if location:
        conditions.append('location = %s')
        params.append(location)
    if source_type:
        conditions.append('source_type = %s')
        params.append(source_type)
    if source_id is not None and source_id != '':
        # allow numeric or string ids; pass through as-is for parameterized query
        conditions.append('source_id = %s')
        params.append(source_id)

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


def _ensure_datetime(val):
    """Normalize DB values (datetime/date/str) to timezone-aware UTC datetimes."""
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, date):
        return datetime.combine(val, datetime.min.time(), tzinfo=timezone.utc)
    if isinstance(val, str):
        try:
            # Handle trailing Z or offset-naive strings
            cleaned = val.replace('Z', '+00:00') if val.endswith('Z') else val
            return datetime.fromisoformat(cleaned)
        except Exception:
            return None
    return None


def _get_global_conversion_map(cursor):
    """Return {(from_unit, to_unit): factor} for global conversions."""
    cursor.execute("""
        SELECT LOWER(from_unit) AS from_unit, LOWER(to_unit) AS to_unit, factor
        FROM ingredient_conversions
        WHERE is_global = TRUE
    """)
    rows = cursor.fetchall()
    conv = {}
    for r in rows:
        try:
            key = ((r.get('from_unit') or '').strip().lower(), (r.get('to_unit') or '').strip().lower())
            conv[key] = float(r.get('factor'))
        except Exception:
            continue
    return conv


def _conversion_factor(from_unit, to_unit, conv_map):
    if not from_unit or not to_unit:
        return None
    key = (str(from_unit).strip().lower(), str(to_unit).strip().lower())
    return conv_map.get(key)


@inventory_bp.route('/api/inventory/reconciliation/latest', methods=['GET'])
def inventory_reconciliation_latest():
    """
    Compute variances between the two most recent inventory counts per ingredient,
    factoring purchases, adjustments, and sales-driven usage (via recipes).
    Returns one row per ingredient that has at least one inventory count in the lookback window.
    """
    lookback_days = request.args.get('lookback_days', type=int) or 45
    ingredient_filter = request.args.get('ingredient_id')

    cursor = get_db_cursor()
    try:
        # Limit scan window for inventory_count_entries to reduce workload while still allowing a prior count.
        buffer_days = max(lookback_days * 2, 60)
        # Pull the latest two counts for each ingredient
        cursor.execute("""
            WITH ranked AS (
                SELECT
                    source_id AS ingredient_id,
                    quantity,
                    unit,
                    quantity_base,
                    base_unit,
                    location,
                    created_at,
                    user_id,
                    ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY created_at DESC) AS rn
                FROM inventory_count_entries
                WHERE source_type = 'ingredient'
                  AND created_at >= NOW() - (%s || ' days')::interval
            )
            SELECT * FROM ranked WHERE rn <= 2
        """, (buffer_days,))
        count_rows = cursor.fetchall()

        latest_counts = {}
        previous_counts = {}
        for row in count_rows:
            iid = row.get('ingredient_id')
            if ingredient_filter and str(iid) != str(ingredient_filter):
                continue
            rn = row.get('rn')
            if rn == 1:
                latest_counts[iid] = row
            elif rn == 2:
                previous_counts[iid] = row

        if not latest_counts:
            return jsonify({'results': [], 'meta': {'message': 'No inventory counts found'}})

        # Filter to ingredients whose latest count is within the lookback window
        now_ts = datetime.now(timezone.utc)
        cutoff = now_ts - timedelta(days=lookback_days)
        filtered_ids = [iid for iid, row in latest_counts.items() if (_ensure_datetime(row.get('created_at')) or cutoff) >= cutoff]

        if ingredient_filter and str(ingredient_filter) in map(str, filtered_ids):
            filtered_ids = [int(ingredient_filter)]

        if not filtered_ids:
            return jsonify({'results': [], 'meta': {'message': 'No recent inventory counts in the selected window'}})

        # Build ingredient name lookup
        cursor.execute("SELECT ingredient_id, name FROM ingredients WHERE ingredient_id = ANY(%s)", (filtered_ids,))
        ing_rows = cursor.fetchall()
        ing_name = {r['ingredient_id']: r.get('name') for r in ing_rows}

        # Establish global time bounds for fetching purchases/adjustments/sales
        interval_starts = []
        interval_ends = []
        for iid in filtered_ids:
            latest_row = latest_counts.get(iid)
            prev_row = previous_counts.get(iid)
            ldt = _ensure_datetime(latest_row.get('created_at')) if latest_row else None
            pdt = _ensure_datetime(prev_row.get('created_at')) if prev_row else None
            if ldt:
                interval_ends.append(ldt)
            if pdt:
                interval_starts.append(pdt)
        global_start = min(interval_starts) if interval_starts else cutoff
        global_end = max(interval_ends) if interval_ends else now_ts

        # Fetch purchases within the window for relevant ingredients
        cursor.execute("""
            SELECT ingredient_id, units, unit_type, receive_date
            FROM received_goods
            WHERE ingredient_id = ANY(%s)
              AND receive_date >= %s
              AND receive_date <= %s
        """, (filtered_ids, global_start, global_end))
        purchase_rows = cursor.fetchall()

        purchases_by_ing = defaultdict(list)
        for r in purchase_rows:
            iid = r.get('ingredient_id')
            qty = r.get('units')
            unit_type = r.get('unit_type')
            try:
                qty_base, base_unit = convert_to_base(iid, 'ingredient', unit_type, qty)
                qty_base = float(qty_base)
            except Exception:
                qty_base = float(qty or 0)
                base_unit = unit_type
            ts = _ensure_datetime(r.get('receive_date')) or global_start
            purchases_by_ing[iid].append({'ts': ts, 'quantity_base': qty_base, 'base_unit': base_unit or unit_type})

        # Fetch adjustments
        cursor.execute("""
            SELECT source_id AS ingredient_id, quantity_base, base_unit, created_at
            FROM inventory_adjustments
            WHERE source_type = 'ingredient'
              AND source_id = ANY(%s)
              AND created_at > %s
              AND created_at <= %s
        """, (filtered_ids, global_start, global_end))
        adjustment_rows = cursor.fetchall()
        adjustments_by_ing = defaultdict(list)
        for r in adjustment_rows:
            iid = r.get('ingredient_id')
            ts = _ensure_datetime(r.get('created_at')) or global_start
            try:
                qty_base = float(r.get('quantity_base') or 0)
            except Exception:
                qty_base = 0.0
            adjustments_by_ing[iid].append({'ts': ts, 'quantity_base': qty_base, 'base_unit': r.get('base_unit')})

        # Preload items, recipes, and conversions for usage calculations
        cursor.execute("SELECT * FROM items")
        item_rows = cursor.fetchall()
        items_lookup = {r.get('item_id'): r for r in item_rows}

        cursor.execute("SELECT * FROM recipes WHERE archived IS NULL OR archived = FALSE")
        recipe_rows = cursor.fetchall()
        recipes_lookup = defaultdict(list)
        for r in recipe_rows:
            recipes_lookup[r.get('item_id')].append(r)

        # Build a dependency map so we only pull sales for items that feed into the filtered ingredients
        item_components = defaultdict(list)
        for r in recipe_rows:
            item_components[r.get('item_id')].append({'source_type': r.get('source_type'), 'source_id': r.get('source_id')})

        memo_depends = {}

        def depends_on_filtered(item_id, visiting=None):
            visiting = visiting or set()
            if item_id in memo_depends:
                return memo_depends[item_id]
            if item_id in visiting:
                memo_depends[item_id] = False
                return False
            visiting.add(item_id)
            comps = item_components.get(item_id, [])
            for c in comps:
                if c.get('source_type') == 'ingredient' and c.get('source_id') in filtered_ids:
                    memo_depends[item_id] = True
                    return True
                if c.get('source_type') == 'item':
                    child_id = c.get('source_id')
                    if child_id and depends_on_filtered(child_id, visiting=set(visiting)):
                        memo_depends[item_id] = True
                        return True
            memo_depends[item_id] = False
            return False

        relevant_item_ids = [iid for iid in item_components.keys() if depends_on_filtered(iid)]

        # Fetch sales rows in the window but only for relevant items
        sales_rows = []
        if relevant_item_ids:
            cursor.execute("""
                SELECT business_date, item_id, item_name, item_qty
                FROM sales_daily_lines
                WHERE business_date > %s
                  AND business_date <= %s
                  AND item_id = ANY(%s)
            """, (global_start, global_end, relevant_item_ids))
            sales_rows = cursor.fetchall()

        global_conversions = _get_global_conversion_map(cursor)

        usage_cache = {}
        skipped_sales = {'no_item_id': 0, 'missing_recipe': defaultdict(float), 'compute_errors': defaultdict(float)}

        def resolve_usage_per_unit(item_id, output_unit, visited=None):
            key = (item_id, (output_unit or '').strip().lower())
            if key in usage_cache:
                return usage_cache[key]

            visited = visited or set()
            if item_id in visited:
                usage_cache[key] = {'status': 'error', 'issue': 'circular', 'ingredients': {}}
                return usage_cache[key]
            visited.add(item_id)

            item = items_lookup.get(item_id)
            comps = recipes_lookup.get(item_id, [])
            if not item or not comps:
                usage_cache[key] = {'status': 'error', 'issue': 'missing_recipe', 'ingredients': {}}
                return usage_cache[key]

            totals = defaultdict(lambda: {'quantity_base': 0.0, 'base_unit': None})
            issues = []

            for comp in comps:
                c_qty = comp.get('quantity')
                c_unit = comp.get('unit')
                try:
                    qty_val = float(c_qty)
                except Exception:
                    issues.append({'component': comp, 'issue': 'invalid_quantity'})
                    continue

                if comp.get('source_type') == 'ingredient':
                    iid = comp.get('source_id')
                    try:
                        qty_base, base_unit = convert_to_base(iid, 'ingredient', c_unit, qty_val)
                        qty_base = float(qty_base)
                    except Exception:
                        qty_base = qty_val
                        base_unit = c_unit
                    cur = totals[iid]
                    cur['quantity_base'] += qty_base
                    cur['base_unit'] = cur['base_unit'] or base_unit
                elif comp.get('source_type') == 'item':
                    child_id = comp.get('source_id')
                    child_usage = resolve_usage_per_unit(child_id, c_unit, visited=set(visited))
                    if child_usage.get('status') != 'ok':
                        issues.append({'component': comp, 'issue': child_usage.get('issue')})
                        continue
                    for iid, info in child_usage['ingredients'].items():
                        cur = totals[iid]
                        cur['quantity_base'] += info['quantity_base'] * qty_val
                        cur['base_unit'] = cur['base_unit'] or info.get('base_unit')
                else:
                    issues.append({'component': comp, 'issue': 'unknown_source_type'})

            # Yield scaling: divide totals by effective yield to get per-unit usage
            yield_qty = item.get('yield_qty')
            yield_unit = (item.get('yield_unit') or '').strip().lower() or output_unit or 'unit'

            try:
                yield_qty_val = float(yield_qty) if yield_qty is not None else 1.0
            except Exception:
                yield_qty_val = 1.0

            output_unit_norm = (output_unit or yield_unit or '').strip().lower()
            factor = 1.0
            if yield_unit != output_unit_norm:
                conv = _conversion_factor(yield_unit, output_unit_norm, global_conversions)
                if conv:
                    factor = float(conv)
                else:
                    issues.append({'issue': 'missing_yield_conversion', 'from': yield_unit, 'to': output_unit_norm})

            effective_yield = yield_qty_val * factor if yield_qty_val else 1.0
            if effective_yield == 0:
                effective_yield = 1.0
                issues.append({'issue': 'zero_effective_yield'})

            per_unit = {}
            for iid, info in totals.items():
                per_unit[iid] = {
                    'quantity_base': info['quantity_base'] / effective_yield if effective_yield else info['quantity_base'],
                    'base_unit': info.get('base_unit')
                }

            status = 'ok' if not issues else 'warning'
            usage_cache[key] = {'status': status, 'issue': issues, 'ingredients': per_unit}
            return usage_cache[key]

        sales_usage_events = defaultdict(list)

        for row in sales_rows:
            item_id = row.get('item_id')
            qty_raw = row.get('item_qty')
            try:
                qty_sold = float(qty_raw or 0)
            except Exception:
                qty_sold = 0.0
            if not qty_sold:
                continue

            ts = _ensure_datetime(row.get('business_date')) or global_start
            if not item_id:
                skipped_sales['no_item_id'] += qty_sold
                continue

            usage = resolve_usage_per_unit(item_id, (items_lookup.get(item_id) or {}).get('yield_unit'))
            if usage.get('status') == 'error':
                skipped_sales['missing_recipe'][item_id] += qty_sold
                continue
            if usage.get('status') != 'ok':
                skipped_sales['compute_errors'][item_id] += qty_sold

            for iid, info in usage.get('ingredients', {}).items():
                amount = (info.get('quantity_base') or 0) * qty_sold
                sales_usage_events[iid].append({
                    'ts': ts,
                    'quantity_base': amount,
                    'base_unit': info.get('base_unit'),
                    'item_id': item_id,
                    'item_name': row.get('item_name') or (items_lookup.get(item_id) or {}).get('name'),
                    'qty_sold': qty_sold
                })

        results = []
        for iid in filtered_ids:
            latest_row = latest_counts.get(iid)
            prev_row = previous_counts.get(iid)

            latest_dt = _ensure_datetime(latest_row.get('created_at')) if latest_row else None
            prev_dt = _ensure_datetime(prev_row.get('created_at')) if prev_row else None

            purchases = sum(
                e['quantity_base']
                for e in purchases_by_ing.get(iid, [])
                if (not prev_dt or e['ts'] >= prev_dt) and (not latest_dt or e['ts'] <= latest_dt)
            )
            adjustments = sum(e['quantity_base'] for e in adjustments_by_ing.get(iid, []) if (not prev_dt or e['ts'] > prev_dt) and (not latest_dt or e['ts'] <= latest_dt))
            usage = sum(e['quantity_base'] for e in sales_usage_events.get(iid, []) if (not prev_dt or e['ts'] > prev_dt) and (not latest_dt or e['ts'] <= latest_dt))

            expected = None
            variance = None
            if prev_row:
                try:
                    expected = float(prev_row.get('quantity_base') or 0) + purchases + adjustments - usage
                    variance = float(latest_row.get('quantity_base') or 0) - expected
                except Exception:
                    expected = None
                    variance = None

            breakdown_map = defaultdict(lambda: {'item_id': None, 'item_name': None, 'qty_sold': 0.0, 'usage_base': 0.0})
            for e in sales_usage_events.get(iid, []):
                if prev_dt and e['ts'] <= prev_dt:
                    continue
                if latest_dt and e['ts'] > latest_dt:
                    continue
                k = e.get('item_id') or e.get('item_name')
                entry = breakdown_map[k]
                entry['item_id'] = e.get('item_id')
                entry['item_name'] = e.get('item_name')
                entry['qty_sold'] += e.get('qty_sold') or 0
                entry['usage_base'] += e.get('quantity_base') or 0

            breakdown = sorted(breakdown_map.values(), key=lambda x: abs(x['usage_base']), reverse=True)

            results.append({
                'ingredient_id': iid,
                'ingredient_name': ing_name.get(iid) or f'Ingredient {iid}',
                'latest_count': {
                    'quantity_base': latest_row.get('quantity_base'),
                    'base_unit': latest_row.get('base_unit') or latest_row.get('unit'),
                    'quantity': latest_row.get('quantity'),
                    'unit': latest_row.get('unit'),
                    'location': latest_row.get('location'),
                    'created_at': latest_dt.isoformat() if latest_dt else None,
                    'user_id': latest_row.get('user_id')
                },
                'previous_count': {
                    'quantity_base': prev_row.get('quantity_base') if prev_row else None,
                    'base_unit': prev_row.get('base_unit') if prev_row else None,
                    'quantity': prev_row.get('quantity') if prev_row else None,
                    'unit': prev_row.get('unit') if prev_row else None,
                    'location': prev_row.get('location') if prev_row else None,
                    'created_at': prev_dt.isoformat() if prev_dt else None,
                    'user_id': prev_row.get('user_id') if prev_row else None
                } if prev_row else None,
                'purchases_base': purchases,
                'adjustments_base': adjustments,
                'sales_usage_base': usage,
                'expected_base': expected,
                'variance_base': variance,
                'sales_breakdown': breakdown
            })

        # Sort by largest variance magnitude first
        results.sort(key=lambda r: abs(r['variance_base'] or 0), reverse=True)

        meta = {
            'ingredients_scanned': len(filtered_ids),
            'sales_skipped_no_item': skipped_sales['no_item_id'],
            'sales_skipped_missing_recipe': {items_lookup.get(k, {}).get('name', f'item {k}'): v for k, v in skipped_sales['missing_recipe'].items()},
            'sales_skipped_compute_errors': {items_lookup.get(k, {}).get('name', f'item {k}'): v for k, v in skipped_sales['compute_errors'].items()},
            'window_start': global_start.isoformat() if isinstance(global_start, datetime) else None,
            'window_end': global_end.isoformat() if isinstance(global_end, datetime) else None
        }

        return jsonify({'results': results, 'meta': meta}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Database error', 'details': str(e)}), 500
    finally:
        try:
            cursor.close()
        except Exception:
            pass
