from flask import Blueprint, request, jsonify
from .utils.db import get_db_cursor
from .utils.cost_resolver import resolve_item_cost

reports_bp = Blueprint('reports', __name__, url_prefix='/api')

@reports_bp.route('/reports/daily_margin', methods=['GET'])
def daily_margin():
    business_date = request.args.get('business_date')
    if not business_date:
        return jsonify({'error': 'business_date required'}), 400

    cursor = get_db_cursor()
    try:
        cursor.execute("""
            SELECT s.item_id, COALESCE(i.name, s.item_name) AS name,
                   SUM(COALESCE(s.item_qty,0)) AS qty_sold,
                   SUM(COALESCE(s.net_sales,0)) AS net_sales
            FROM sales_daily_lines s
            LEFT JOIN items i ON s.item_id = i.item_id
            WHERE s.business_date = %s
            GROUP BY s.item_id, COALESCE(i.name, s.item_name)
        """, (business_date,))
        rows = cursor.fetchall()

        results = []
        totals = {'net_sales': 0.0, 'cost_of_goods': 0.0, 'margin': 0.0}

        for r in rows:
            item_id = r.get('item_id')
            name = r.get('name')
            qty = float(r.get('qty_sold') or 0)
            net_sales = float(r.get('net_sales') or 0)

            cost_per_unit = None
            total_cost = None

            if item_id:
                # try to read stored cost on item first
                try:
                    c = get_db_cursor()
                    c.execute("SELECT cost, yield_unit FROM items WHERE item_id = %s", (item_id,))
                    it = c.fetchone()
                    c.close()
                    if it and it.get('cost') is not None:
                        cost_per_unit = float(it.get('cost'))
                    else:
                        # attempt to resolve using recipe & yield_unit
                        unit = it.get('yield_unit') if it else None
                        if unit:
                            res = resolve_item_cost(item_id, unit, 1)
                            if isinstance(res, dict) and res.get('status') == 'ok':
                                cost_per_unit = float(res.get('cost_per_unit'))
                except Exception:
                    cost_per_unit = None

            if cost_per_unit is not None:
                total_cost = cost_per_unit * qty
            else:
                total_cost = None

            margin = net_sales - (total_cost if total_cost is not None else 0)
            margin_pct = (margin / net_sales * 100) if net_sales and net_sales != 0 else None

            if net_sales:
                totals['net_sales'] += net_sales
            if total_cost is not None:
                totals['cost_of_goods'] += total_cost
            if margin is not None:
                totals['margin'] += margin

            results.append({
                'item_id': item_id,
                'name': name,
                'qty_sold': qty,
                'net_sales': net_sales,
                'cost_per_unit': cost_per_unit,
                'total_cost': total_cost,
                'margin': margin,
                'margin_pct': round(margin_pct,2) if margin_pct is not None else None
            })

        return jsonify({'date': business_date, 'items': results, 'totals': totals})
    finally:
        try:
            cursor.close()
        except Exception:
            pass
