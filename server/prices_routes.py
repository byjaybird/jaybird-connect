from flask import Blueprint, request, jsonify
from datetime import date, datetime, timedelta
from .utils.db import get_db_cursor
from .utils.cost_resolver import resolve_item_cost

prices_bp = Blueprint('prices', __name__, url_prefix='/api')


def _parse_date_arg(value, fallback=None):
    if not value:
        return fallback
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except Exception:
        return fallback


def _safe_div(n, d):
    try:
        if d:
            return n / d
    except Exception:
        return None
    return None


def _iso(val):
    if isinstance(val, (date, datetime)):
        return val.isoformat()
    return val

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


@prices_bp.route('/prices/margin_dashboard', methods=['GET'])
def margin_dashboard():
    """Margin dashboard data for Prices tab based on sales uploads and recipe costs."""
    today = date.today()
    end_date = _parse_date_arg(request.args.get('end_date'), today)

    try:
        days = int(request.args.get('days', 30))
    except Exception:
        days = 30
    days = max(1, min(days, 180))

    start_date = _parse_date_arg(request.args.get('start_date'))
    if not start_date:
        start_date = end_date - timedelta(days=days - 1)
    if start_date > end_date:
        start_date, end_date = end_date, start_date

    # Prior window is the same length immediately before the current window
    prior_end = start_date - timedelta(days=1)
    prior_start = prior_end - timedelta(days=days - 1)

    cursor = get_db_cursor()
    try:
        cursor.execute(
            """
            SELECT
                COALESCE(i.name, s.item_name) AS name,
                s.item_id,
                COALESCE(s.sales_category, 'Uncategorized') AS category,
                SUM(COALESCE(s.item_qty, 0)) AS qty,
                SUM(COALESCE(s.net_sales, 0)) AS net_sales,
                SUM(COALESCE(s.gross_sales, 0)) AS gross_sales,
                SUM(COALESCE(s.discount_amount, 0)) AS discounts,
                COUNT(*) AS rows
            FROM sales_daily_lines s
            LEFT JOIN items i ON s.item_id = i.item_id
            WHERE s.business_date BETWEEN %s AND %s
            GROUP BY COALESCE(i.name, s.item_name), s.item_id, COALESCE(s.sales_category, 'Uncategorized')
            """,
            (start_date, end_date)
        )
        current_items = cursor.fetchall() or []

        cursor.execute(
            """
            SELECT
                COALESCE(i.name, s.item_name) AS name,
                s.item_id,
                SUM(COALESCE(s.item_qty, 0)) AS qty,
                SUM(COALESCE(s.net_sales, 0)) AS net_sales,
                SUM(COALESCE(s.gross_sales, 0)) AS gross_sales,
                SUM(COALESCE(s.discount_amount, 0)) AS discounts
            FROM sales_daily_lines s
            LEFT JOIN items i ON s.item_id = i.item_id
            WHERE s.business_date BETWEEN %s AND %s
            GROUP BY COALESCE(i.name, s.item_name), s.item_id
            """,
            (prior_start, prior_end)
        )
        prior_items = cursor.fetchall() or []
        prior_by_key = {
            f"{r.get('item_id') or 'none'}|{(r.get('name') or '').strip().lower()}": r for r in prior_items
        }

        cursor.execute(
            """
            SELECT
                s.business_date,
                COALESCE(i.name, s.item_name) AS name,
                s.item_id,
                SUM(COALESCE(s.item_qty, 0)) AS qty,
                SUM(COALESCE(s.net_sales, 0)) AS net_sales,
                SUM(COALESCE(s.discount_amount, 0)) AS discounts
            FROM sales_daily_lines s
            LEFT JOIN items i ON s.item_id = i.item_id
            WHERE s.business_date BETWEEN %s AND %s
            GROUP BY s.business_date, COALESCE(i.name, s.item_name), s.item_id
            ORDER BY s.business_date ASC
            """,
            (start_date, end_date)
        )
        per_day_rows = cursor.fetchall() or []

        cursor.execute(
            """
            SELECT
                SUM(CASE WHEN item_id IS NOT NULL THEN 1 ELSE 0 END) AS mapped_rows,
                SUM(CASE WHEN item_id IS NULL THEN 1 ELSE 0 END) AS unmapped_rows
            FROM sales_daily_lines
            WHERE business_date BETWEEN %s AND %s
            """,
            (start_date, end_date)
        )
        mapping_row = cursor.fetchone() or {}

        cursor.execute(
            """
            SELECT
                COALESCE(s.sales_category, 'Uncategorized') AS category,
                SUM(COALESCE(s.item_qty, 0)) AS qty,
                SUM(COALESCE(s.net_sales, 0)) AS net_sales,
                SUM(COALESCE(s.discount_amount, 0)) AS discounts
            FROM sales_daily_lines s
            WHERE s.business_date BETWEEN %s AND %s
            GROUP BY COALESCE(s.sales_category, 'Uncategorized')
            ORDER BY net_sales DESC
            """,
            (start_date, end_date)
        )
        categories_rows = cursor.fetchall() or []

        item_ids = {
            row.get('item_id')
            for row in current_items + prior_items
            if row.get('item_id') is not None
        }
        yield_units = {}
        if item_ids:
            cursor.execute(
                "SELECT item_id, yield_unit FROM items WHERE item_id = ANY(%s)",
                (list(item_ids),)
            )
            for r in cursor.fetchall() or []:
                yield_units[r.get('item_id')] = (r.get('yield_unit') or '').strip().lower() or None

        # Resolve cost per item_id once
        cost_cache = {}
        missing_cost_items = []
        items_payload = []
        totals_margin = 0.0
        totals_net = 0.0
        totals_gross = 0.0
        totals_qty = 0.0
        totals_discounts = 0.0

        for row in current_items:
            item_id = row.get('item_id')
            key = f"{item_id}" if item_id is not None else None
            name = row.get('name')
            qty = float(row.get('qty') or 0)
            net_val = float(row.get('net_sales') or 0)
            gross_val = float(row.get('gross_sales') or 0)
            disc_val = float(row.get('discounts') or 0)

            cost_per_unit = None
            cost_issue = None
            if item_id is not None:
                if key in cost_cache:
                    cost_per_unit, cost_issue = cost_cache[key]
                else:
                    recipe_unit = yield_units.get(item_id) or 'each'
                    try:
                        cost_result = resolve_item_cost(item_id, recipe_unit, 1)
                    except Exception as e:
                        cost_result = {'status': 'error', 'issue': 'exception', 'message': str(e)}
                    if isinstance(cost_result, dict) and cost_result.get('status') == 'ok':
                        cost_per_unit = float(cost_result.get('cost_per_unit'))
                    else:
                        cost_issue = cost_result
                    cost_cache[key] = (cost_per_unit, cost_issue)
            else:
                cost_issue = {'status': 'unmapped'}

            realized_price = net_val / qty if qty else None
            margin_unit = None
            margin_total = None
            margin_pct = None
            if cost_per_unit is not None and qty and realized_price is not None:
                margin_unit = realized_price - cost_per_unit
                margin_total = margin_unit * qty
                margin_pct = (margin_unit / realized_price) * 100 if realized_price else None
                totals_margin += margin_total

            totals_net += net_val
            totals_gross += gross_val
            totals_qty += qty
            totals_discounts += disc_val

            prior_row = prior_by_key.get(f"{item_id or 'none'}|{(name or '').strip().lower()}")
            prior_net = float(prior_row.get('net_sales') or 0) if prior_row else 0.0
            prior_qty = float(prior_row.get('qty') or 0) if prior_row else 0.0

            if cost_issue and item_id is not None:
                missing_cost_items.append({
                    'item_id': item_id,
                    'name': name,
                    'qty': qty,
                    'net_sales': net_val,
                    'issue': cost_issue
                })

            items_payload.append({
                'item_id': item_id,
                'name': name,
                'category': row.get('category'),
                'qty': qty,
                'net_sales': net_val,
                'gross_sales': gross_val,
                'discounts': disc_val,
                'realized_price': realized_price,
                'cost_per_unit': cost_per_unit,
                'margin_per_unit': margin_unit,
                'margin_total': margin_total,
                'margin_pct': margin_pct,
                'discount_rate_pct': (disc_val / gross_val * 100) if gross_val else None,
                'prior_net_sales': prior_net,
                'prior_qty': prior_qty
            })

        # Daily trend with margin (uses resolved cost cache)
        daily_map = {}
        for r in per_day_rows:
            day = _iso(r.get('business_date'))
            qty = float(r.get('qty') or 0)
            net_val = float(r.get('net_sales') or 0)
            disc_val = float(r.get('discounts') or 0)
            item_id = r.get('item_id')
            cost_per_unit = None
            if item_id is not None:
                cost_per_unit, _ = cost_cache.get(f"{item_id}", (None, None))
            margin_part = (net_val / qty - cost_per_unit) * qty if cost_per_unit is not None and qty else 0.0
            entry = daily_map.get(day) or {'business_date': day, 'qty': 0.0, 'net_sales': 0.0, 'discounts': 0.0, 'margin': 0.0}
            entry['qty'] += qty
            entry['net_sales'] += net_val
            entry['discounts'] += disc_val
            entry['margin'] += margin_part
            daily_map[day] = entry
        daily = sorted(daily_map.values(), key=lambda x: x['business_date'])

        prior_totals_net = sum(float(r.get('net_sales') or 0) for r in prior_items)
        prior_totals_qty = sum(float(r.get('qty') or 0) for r in prior_items)
        prior_totals_gross = sum(float(r.get('gross_sales') or 0) for r in prior_items)
        prior_totals_disc = sum(float(r.get('discounts') or 0) for r in prior_items)
        prior_margin_total = 0.0
        for r in prior_items:
            qty_val = float(r.get('qty') or 0)
            net_val = float(r.get('net_sales') or 0)
            item_id = r.get('item_id')
            if not qty_val or item_id is None:
                continue
            cached = cost_cache.get(f"{item_id}")
            if cached:
                cost_per_unit = cached[0]
            else:
                recipe_unit = yield_units.get(item_id) or 'each'
                try:
                    cost_result = resolve_item_cost(item_id, recipe_unit, 1)
                except Exception as e:
                    cost_result = {'status': 'error', 'issue': 'exception', 'message': str(e)}
                cost_per_unit = float(cost_result.get('cost_per_unit')) if isinstance(cost_result, dict) and cost_result.get('status') == 'ok' else None
                cost_cache[f"{item_id}"] = (cost_per_unit, cost_result if (not cost_per_unit) else None)
            if cost_per_unit is None:
                continue
            realized = net_val / qty_val
            prior_margin_total += (realized - cost_per_unit) * qty_val
        prior_summary = {
            'net_sales': prior_totals_net,
            'qty': prior_totals_qty,
            'gross_sales': prior_totals_gross,
            'discounts': prior_totals_disc,
            'avg_price': _safe_div(prior_totals_net, prior_totals_qty),
            'discount_rate_pct': _safe_div(prior_totals_disc, prior_totals_gross) * 100 if prior_totals_gross else None,
            'margin': prior_margin_total,
            'margin_pct': (_safe_div(prior_margin_total, prior_totals_net) * 100) if prior_totals_net else None
        }

        unmapped = [
            {
                'name': r.get('name'),
                'qty': float(r.get('qty') or 0),
                'net_sales': float(r.get('net_sales') or 0)
            }
            for r in current_items if r.get('item_id') is None
        ]
        unmapped = sorted(unmapped, key=lambda x: x['net_sales'], reverse=True)[:15]

        categories = [
            {
                'category': r.get('category'),
                'qty': float(r.get('qty') or 0),
                'net_sales': float(r.get('net_sales') or 0),
                'discounts': float(r.get('discounts') or 0)
            }
            for r in categories_rows
        ]

        mapped_rows_val = int(mapping_row.get('mapped_rows') or 0)
        unmapped_rows_val = int(mapping_row.get('unmapped_rows') or 0)
        mapping_total = mapped_rows_val + unmapped_rows_val
        mapping_rate = _safe_div(mapped_rows_val, mapping_total)

        margin_pct_total = (_safe_div(totals_margin, totals_net) * 100) if totals_net else None
        discount_rate = _safe_div(totals_discounts, totals_gross)
        avg_margin_per_unit = _safe_div(totals_margin, totals_qty) if totals_qty else None

        payload = {
            'window': {
                'start_date': _iso(start_date),
                'end_date': _iso(end_date),
                'days': days
            },
            'prior_window': {
                'start_date': _iso(prior_start),
                'end_date': _iso(prior_end),
                'days': days
            },
            'summary': {
                'net_sales': totals_net,
                'gross_sales': totals_gross,
                'qty': totals_qty,
                'discounts': totals_discounts,
                'margin': totals_margin,
                'margin_pct': margin_pct_total,
                'avg_price': _safe_div(totals_net, totals_qty),
                'avg_margin_per_unit': avg_margin_per_unit,
                'discount_rate_pct': discount_rate * 100 if discount_rate is not None else None
            },
            'prior_summary': prior_summary,
            'mapping': {
                'mapped_rows': mapped_rows_val,
                'unmapped_rows': unmapped_rows_val,
                'mapping_rate_pct': mapping_rate * 100 if mapping_rate is not None else None
            },
            'items': items_payload,
            'categories': categories,
            'unmapped': unmapped,
            'missing_cost_items': missing_cost_items,
            'daily': daily
        }
        return jsonify(payload)
    finally:
        try:
            cursor.close()
        except Exception:
            pass
