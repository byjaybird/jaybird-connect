from flask import Blueprint, request, jsonify
from .utils.db import get_db_cursor
import csv
import io
import re
import hashlib
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, timedelta

sales_bp = Blueprint('sales', __name__, url_prefix='/api')

ID_FIELDS = ['Master ID', 'Item ID', 'Parent ID']


def parse_date_arg(value, fallback=None):
    if not value:
        return fallback
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except Exception:
        return fallback


def daterange(start_day, end_day):
    current = start_day
    while current <= end_day:
        yield current
        current += timedelta(days=1)


def normalize_id(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == '':
        return None
    # Remove surrounding quotes
    s = s.strip('"')
    # Try to parse as Decimal then int to avoid scientific notation
    try:
        d = Decimal(s)
        # If it's effectively integer, convert to int
        try:
            i = int(d)
            return str(i)
        except (OverflowError, ValueError):
            # fallback to plain string without decimal part
            pass
    except (InvalidOperation, ValueError):
        pass
    # Fallback: remove decimal part if present
    if '.' in s:
        return s.split('.')[0]
    return s


def parse_numeric(val):
    if val is None or val == '':
        return None
    try:
        # Remove currency symbols and commas
        cleaned = re.sub(r"[^0-9.\-]", "", str(val))
        if cleaned == '':
            return None
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


@sales_bp.route('/sales/upload', methods=['POST'])
def upload_sales():
    """Accept a CSV file upload (multipart/form-data) or JSON with base64? Frontend
    should post the CSV file as 'file'. We extract business_date from filename
    if possible and store rows into sales_uploads and sales_daily_lines.
    """
    # Auth is enforced globally in main.py before_request

    file = None
    notes = request.form.get('notes') if request.form else None
    business_date = request.form.get('business_date') if request.form else None
    default_sales_category = request.form.get('default_sales_category') if request.form else None
    if 'file' in request.files:
        file = request.files.get('file')
        filename = file.filename
        raw = file.read()
        # Prepare CSV reader
        try:
            text = raw.decode('utf-8')
        except Exception:
            try:
                text = raw.decode('latin-1')
            except Exception:
                return jsonify({'error': 'Could not decode uploaded file'}), 400
    else:
        # Maybe a JSON body with CSV text
        payload = request.get_json() or {}
        csv_text = payload.get('csv')
        filename = payload.get('filename', 'upload.csv')
        notes = notes or payload.get('notes')
        business_date = business_date or payload.get('business_date')
        default_sales_category = default_sales_category or payload.get('default_sales_category')
        if not csv_text:
            return jsonify({'error': 'No file uploaded'}), 400
        text = csv_text
        raw = text.encode('utf-8')

    # compute sha256
    file_sha = hashlib.sha256(raw).hexdigest()

    # try to extract business_date from filename if not supplied
    if not business_date:
        m = re.search(r"(\d{4}[-_]\d{2}[-_]\d{2})", filename or '')
        if m:
            try:
                business_date = datetime.strptime(m.group(1).replace('_', '-'), '%Y-%m-%d').date().isoformat()
            except Exception:
                business_date = None

    # require a valid business_date so we do not hit DB NOT NULL errors later
    if business_date:
        try:
            business_date = datetime.strptime(str(business_date).replace('_', '-'), '%Y-%m-%d').date().isoformat()
        except Exception:
            return jsonify({'error': 'business_date must be in YYYY-MM-DD format (e.g., 2024-05-01). Provide it in the form; filename date is optional.'}), 400
    else:
        return jsonify({'error': 'business_date is required. Please fill the Business Date field (YYYY-MM-DD). Filename date is optional.'}), 400

    # parse CSV
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    # filter rows where an item name is present (supports legacy 'Menu Item' and new 'Item' header)
    filtered = []
    for r in rows:
        item_field = (
            r.get('Item') or r.get('item') or r.get('Item Name') or
            r.get('Menu Item') or r.get('MenuItem') or r.get('Menu_Item')
        )
        if item_field is None:
            continue
        if str(item_field).strip() == '':
            continue
        filtered.append(r)

    row_count = 0
    cursor = get_db_cursor()
    try:
        # Insert upload record
        cursor.execute(
            """
            INSERT INTO sales_uploads (source_filename, file_sha256, business_date, row_count, notes)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (filename, file_sha, business_date, 0, notes)
        )
        upload_row = cursor.fetchone()
        upload_id = upload_row.get('id') if upload_row else None

        # iterate and insert lines
        rn = 0
        for r in filtered:
            rn += 1
            # IDs: support legacy and new header names
            master_id = normalize_id(
                r.get('Master ID') or r.get('MasterID') or r.get('master_id') or r.get('masterId')
            )
            item_id_text = normalize_id(
                r.get('Item ID') or r.get('ItemID') or r.get('item_id') or r.get('itemGuid') or r.get('item_guid') or r.get('Item GUID')
            )
            parent_id = normalize_id(
                r.get('Parent ID') or r.get('ParentID') or r.get('parent_id') or r.get('parentId')
            )

            # Category / name fields
            menu_name = r.get('Menu Name') or r.get('MenuName')
            menu_group = (
                r.get('Sales Category') or r.get('SalesCategory') or r.get('Menu Group') or r.get('MenuGroup') or None
            )
            subgroup = r.get('Subgroup')
            menu_item = (
                r.get('Item') or r.get('item') or r.get('Item Name') or
                r.get('Menu Item') or r.get('MenuItem') or r.get('Menu_Item')
            )

            # Numeric fields (support multiple header variants). We parse them so the upload is ready
            avg_price = parse_numeric(
                r.get('Avg. price') or r.get('Avg Price') or r.get('AvgPrice')
            )
            avg_item_price = parse_numeric(
                r.get('Avg. item price (not incl. mods)') or r.get('Avg Item Price') or r.get('AvgItemPrice')
            )
            item_cogs = parse_numeric(
                r.get('Item COGS') or r.get('Item Cogs') or r.get('ItemCOGS')
            )
            # Qty: prefer 'Qty sold', fallback to legacy 'Item Qty' or 'Item qty incl. voids'
            item_qty = parse_numeric(
                r.get('Qty sold') or r.get('Qty Sold') or r.get('Item Qty') or r.get('ItemQty') or r.get('Item_Qty') or r.get('Item qty incl. voids') or r.get('Item qty incl voids')
            )
            gross_amount = parse_numeric(
                r.get('Gross sales') or r.get('Gross Sales') or r.get('Gross Amount') or r.get('GrossAmount') or r.get('Gross amount incl. voids')
            )
            void_qty = parse_numeric(
                r.get('Voided qty sold') or r.get('Voided Qty Sold') or r.get('Void Qty') or r.get('VoidQty') or r.get('Voided qty sold')
            )
            discount_amount = parse_numeric(
                r.get('Discount amount') or r.get('Discount Amount') or r.get('DiscountAmount')
            )
            refund_amount = parse_numeric(
                r.get('Refund amount') or r.get('Refund Amount') or r.get('RefundAmount')
            )
            void_amount = parse_numeric(
                r.get('Void amount') or r.get('Void Amount') or r.get('VoidAmount')
            )
            net_amount = parse_numeric(
                r.get('Net sales') or r.get('Net Sales') or r.get('Net Amount') or r.get('NetAmount')
            )
            tax_amount = parse_numeric(
                r.get('Tax') or r.get('Tax Amount') or r.get('TaxAmount')
            )

            # Skip rows that were not actually sold (zero quantity). Ignore rows where item_qty == 0.
            if item_qty is not None and item_qty == 0:
                continue

            # attempt to map menu_item to an internal item_id using sales_item_mappings
            mapped_item_id = None
            try:
                if menu_item and str(menu_item).strip() != '':
                    norm_name = str(menu_item).strip().lower()
                    cursor.execute("SELECT item_id FROM sales_item_mappings WHERE normalized = %s LIMIT 1", (norm_name,))
                    mrow = cursor.fetchone()
                    if mrow:
                        mapped_item_id = mrow.get('item_id')
            except Exception:
                # mapping lookup failure should not block ingest
                mapped_item_id = None

            # row hash for deduplication
            hash_input = f"{upload_id}|{master_id}|{item_id_text}|{menu_item}|{business_date}|{rn}"
            row_hash = hashlib.sha256(hash_input.encode('utf-8')).hexdigest()

            cursor.execute(
                """
                INSERT INTO sales_daily_lines (
                    upload_id, row_num, row_hash, business_date, sales_category,
                    item_name, item_id, item_qty, net_sales, discount_amount, gross_sales, tax_amount
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    upload_id,
                    rn,
                    row_hash,
                    business_date,
                    menu_group or default_sales_category or menu_name,
                    menu_item,
                    mapped_item_id,
                    float(item_qty) if item_qty is not None else None,
                    float(net_amount) if net_amount is not None else None,
                    float(discount_amount) if discount_amount is not None else None,
                    float(gross_amount) if gross_amount is not None else None,
                    0.0
                )
            )
            row_count += 1

        # update upload row_count
        cursor.execute("UPDATE sales_uploads SET row_count = %s WHERE id = %s", (row_count, upload_id))

        return jsonify({'status': 'ok', 'upload_id': upload_id, 'rows': row_count})

    except Exception as e:
        try:
            cursor.connection.rollback()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 500

    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_bp.route('/sales/uploads', methods=['GET'])
def list_uploads():
    """List sales uploads, optionally filtered by business_date"""
    business_date = request.args.get('business_date')
    cursor = get_db_cursor()
    try:
        if business_date:
            cursor.execute("SELECT * FROM sales_uploads WHERE business_date = %s ORDER BY created_at DESC", (business_date,))
        else:
            cursor.execute("SELECT * FROM sales_uploads ORDER BY created_at DESC LIMIT 100")
        rows = cursor.fetchall()
        return jsonify(rows)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


def _iso(val):
    if isinstance(val, (date, datetime)):
        return val.isoformat()
    return val


@sales_bp.route('/sales/uploads/summary', methods=['GET'])
def uploads_summary():
    """Summarize what is currently in sales uploads and sales_daily_lines so we know data coverage."""
    cursor = get_db_cursor()
    try:
        cursor.execute(
            """
            SELECT
                COUNT(*) AS uploads,
                COALESCE(SUM(row_count), 0) AS total_rows,
                MIN(business_date) AS first_date,
                MAX(business_date) AS last_date,
                MAX(created_at) AS last_upload_at
            FROM sales_uploads
            """
        )
        uploads_row = cursor.fetchone() or {}

        cursor.execute(
            """
            SELECT
                COUNT(*) AS rows,
                SUM(COALESCE(item_qty, 0)) AS qty,
                SUM(COALESCE(net_sales, 0)) AS net_sales,
                SUM(COALESCE(gross_sales, 0)) AS gross_sales,
                SUM(COALESCE(discount_amount, 0)) AS discounts
            FROM sales_daily_lines
            """
        )
        totals_row = cursor.fetchone() or {}
        total_rows = float(totals_row.get('rows') or 0)
        total_qty = float(totals_row.get('qty') or 0)
        total_net = float(totals_row.get('net_sales') or 0)
        total_gross = float(totals_row.get('gross_sales') or 0)
        total_discounts = float(totals_row.get('discounts') or 0)

        cursor.execute(
            """
            SELECT
                business_date,
                COUNT(*) AS rows,
                SUM(COALESCE(item_qty, 0)) AS qty,
                SUM(COALESCE(net_sales, 0)) AS net_sales,
                SUM(COALESCE(discount_amount, 0)) AS discounts
            FROM sales_daily_lines
            GROUP BY business_date
            ORDER BY business_date DESC
            LIMIT 31
            """
        )
        by_day_rows = cursor.fetchall() or []
        by_day = []
        for r in by_day_rows:
            qty_val = float(r.get('qty') or 0)
            net_val = float(r.get('net_sales') or 0)
            by_day.append({
                'business_date': _iso(r.get('business_date')),
                'rows': int(r.get('rows') or 0),
                'qty': qty_val,
                'net_sales': net_val,
                'discounts': float(r.get('discounts') or 0),
                'avg_price': net_val / qty_val if qty_val else 0.0
            })

        cursor.execute(
            """
            SELECT
                SUM(CASE WHEN item_id IS NOT NULL THEN 1 ELSE 0 END) AS mapped_rows,
                SUM(CASE WHEN item_id IS NULL THEN 1 ELSE 0 END) AS unmapped_rows,
                COUNT(DISTINCT item_id) FILTER (WHERE item_id IS NOT NULL) AS mapped_items,
                COUNT(DISTINCT LOWER(TRIM(item_name))) AS distinct_sales_names
            FROM sales_daily_lines
            """
        )
        mapping_row = cursor.fetchone() or {}
        mapped_rows = float(mapping_row.get('mapped_rows') or 0)

        cursor.execute(
            """
            SELECT
                COALESCE(i.name, s.item_name) AS name,
                SUM(COALESCE(s.net_sales, 0)) AS net_sales,
                SUM(COALESCE(s.item_qty, 0)) AS qty_sold
            FROM sales_daily_lines s
            LEFT JOIN items i ON s.item_id = i.item_id
            GROUP BY COALESCE(i.name, s.item_name)
            ORDER BY net_sales DESC
            LIMIT 15
            """
        )
        top_items_rows = cursor.fetchall() or []
        top_items = []
        for r in top_items_rows:
            qty_val = float(r.get('qty_sold') or 0)
            net_val = float(r.get('net_sales') or 0)
            top_items.append({
                'name': r.get('name'),
                'net_sales': net_val,
                'qty_sold': qty_val,
                'avg_price': net_val / qty_val if qty_val else 0.0
            })

        cursor.execute(
            """
            SELECT
                COALESCE(s.sales_category, 'Uncategorized') AS category,
                COUNT(*) AS rows,
                SUM(COALESCE(s.net_sales, 0)) AS net_sales,
                SUM(COALESCE(s.item_qty, 0)) AS qty_sold
            FROM sales_daily_lines s
            GROUP BY COALESCE(s.sales_category, 'Uncategorized')
            ORDER BY net_sales DESC
            LIMIT 15
            """
        )
        categories_rows = cursor.fetchall() or []
        categories = [
            {
                'category': r.get('category'),
                'rows': int(r.get('rows') or 0),
                'net_sales': float(r.get('net_sales') or 0),
                'qty_sold': float(r.get('qty_sold') or 0)
            }
            for r in categories_rows
        ]

        cursor.execute(
            """
            SELECT
                SUM(CASE WHEN net_sales IS NOT NULL THEN 1 ELSE 0 END) AS net_sales_rows,
                SUM(CASE WHEN gross_sales IS NOT NULL THEN 1 ELSE 0 END) AS gross_sales_rows,
                SUM(CASE WHEN discount_amount IS NOT NULL THEN 1 ELSE 0 END) AS discount_rows,
                SUM(CASE WHEN item_qty IS NOT NULL THEN 1 ELSE 0 END) AS qty_rows
            FROM sales_daily_lines
            """
        )
        field_cov = cursor.fetchone() or {}

        mapping_rate = (mapped_rows / total_rows * 100) if total_rows else None
        avg_price_per_unit = (total_net / total_qty) if total_qty else 0.0
        avg_discount_rate = (total_discounts / total_gross * 100) if total_gross else None

        payload = {
            'upload_stats': {
                'uploads': int(uploads_row.get('uploads') or 0),
                'total_rows_reported': int(uploads_row.get('total_rows') or 0),
                'first_date': _iso(uploads_row.get('first_date')),
                'last_date': _iso(uploads_row.get('last_date')),
                'last_upload_at': _iso(uploads_row.get('last_upload_at'))
            },
            'line_totals': {
                'rows': int(total_rows),
                'qty': total_qty,
                'net_sales': total_net,
                'gross_sales': total_gross,
                'discounts': total_discounts,
                'avg_price_per_unit': avg_price_per_unit,
                'avg_discount_rate_pct': avg_discount_rate
            },
            'field_coverage': {
                'net_sales_rows': int(field_cov.get('net_sales_rows') or 0),
                'gross_sales_rows': int(field_cov.get('gross_sales_rows') or 0),
                'discount_rows': int(field_cov.get('discount_rows') or 0),
                'qty_rows': int(field_cov.get('qty_rows') or 0)
            },
            'mapping': {
                'mapped_rows': int(mapped_rows),
                'unmapped_rows': int(mapping_row.get('unmapped_rows') or 0),
                'mapped_items': int(mapping_row.get('mapped_items') or 0),
                'distinct_sales_names': int(mapping_row.get('distinct_sales_names') or 0),
                'mapping_rate_pct': mapping_rate
            },
            'recent_days': by_day,
            'top_items': top_items,
            'categories': categories
        }
        return jsonify(payload)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_bp.route('/sales/uploads/<int:upload_id>/reverse', methods=['POST'])
def reverse_upload(upload_id):
    """Delete all sales data associated with a given upload."""
    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT * FROM sales_uploads WHERE id = %s", (upload_id,))
        upload = cursor.fetchone()
        if not upload:
            return jsonify({'error': 'Upload not found'}), 404

        cursor.execute("SELECT COUNT(*) AS cnt FROM sales_daily_lines WHERE upload_id = %s", (upload_id,))
        line_count_row = cursor.fetchone() or {}
        expected_lines = int(line_count_row.get('cnt') or 0)

        cursor.execute("DELETE FROM sales_daily_lines WHERE upload_id = %s", (upload_id,))
        deleted_lines = cursor.rowcount

        cursor.execute("DELETE FROM sales_uploads WHERE id = %s", (upload_id,))
        deleted_uploads = cursor.rowcount

        return jsonify({
            'status': 'ok',
            'upload_id': upload_id,
            'deleted_lines': deleted_lines,
            'expected_lines': expected_lines,
            'deleted_upload_record': bool(deleted_uploads)
        })
    except Exception as e:
        try:
            cursor.connection.rollback()
        except Exception:
            pass
        return jsonify({'error': f'Failed to reverse upload: {str(e)}'}), 500
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_bp.route('/sales/lines', methods=['GET'])
def get_lines():
    """Return sales lines for a given business_date or upload_id"""
    business_date = request.args.get('business_date')
    upload_id = request.args.get('upload_id')
    limit = int(request.args.get('limit', 1000))
    offset = int(request.args.get('offset', 0))
    cursor = get_db_cursor()
    try:
        if upload_id:
            cursor.execute("SELECT * FROM sales_daily_lines WHERE upload_id = %s ORDER BY id LIMIT %s OFFSET %s", (upload_id, limit, offset))
        elif business_date:
            cursor.execute("SELECT * FROM sales_daily_lines WHERE business_date = %s ORDER BY id LIMIT %s OFFSET %s", (business_date, limit, offset))
        else:
            cursor.execute("SELECT * FROM sales_daily_lines ORDER BY id DESC LIMIT %s OFFSET %s", (limit, offset))
        rows = cursor.fetchall()
        return jsonify(rows)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_bp.route('/sales/lines/<int:line_id>', methods=['PUT'])
def update_sales_line(line_id):
    data = request.get_json() or {}
    # Only allow setting item_id for now; preserve other fields if desired
    item_id = data.get('item_id')
    cursor = get_db_cursor()
    try:
        cursor.execute("UPDATE sales_daily_lines SET item_id = %s WHERE id = %s", (item_id, line_id))
        return jsonify({'status': 'ok'})
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_bp.route('/sales/daily_agg', methods=['GET'])
def daily_agg():
    """Return aggregated sales for a given business_date grouped by item_name"""
    business_date = request.args.get('business_date')
    if not business_date:
        return jsonify({'error': 'business_date required'}), 400
    cursor = get_db_cursor()
    try:
        cursor.execute(
            """
            SELECT
                COALESCE(i.name, s.item_name) AS item_name,
                s.item_id,
                SUM(s.item_qty) AS qty_sold,
                SUM(s.net_sales) AS net_sales,
                SUM(s.discount_amount) AS discounts,
                SUM(s.gross_sales) AS gross_sales,
                SUM(s.tax_amount) AS taxes
            FROM sales_daily_lines s
            LEFT JOIN items i ON s.item_id = i.item_id
            WHERE s.business_date = %s
            GROUP BY COALESCE(i.name, s.item_name), s.item_id
            ORDER BY qty_sold DESC
            """,
            (business_date,)
        )
        rows = cursor.fetchall()
        return jsonify(rows)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_bp.route('/sales/daily_summary', methods=['GET'])
def sales_daily_summary():
    """Return total sales per day over a requested window for dashboard insights."""
    today = date.today()
    end_date = parse_date_arg(request.args.get('end_date'), today)
    max_window = 180

    days_param = request.args.get('days')
    try:
        requested_days = int(days_param) if days_param else 30
    except ValueError:
        requested_days = 30
    requested_days = max(1, min(requested_days, max_window))

    start_date = parse_date_arg(request.args.get('start_date'))
    if not start_date:
        start_date = end_date - timedelta(days=requested_days - 1)
    else:
        # If the caller provided an explicit range, clamp it to max_window
        if (end_date - start_date).days + 1 > max_window:
            start_date = end_date - timedelta(days=max_window - 1)

    if start_date > end_date:
        start_date, end_date = end_date, start_date

    cursor = get_db_cursor()
    try:
        cursor.execute(
            """
            SELECT
                business_date,
                SUM(COALESCE(item_qty, 0)) AS qty_sold,
                SUM(COALESCE(net_sales, 0)) AS net_sales,
                SUM(COALESCE(gross_sales, 0)) AS gross_sales,
                SUM(COALESCE(discount_amount, 0)) AS discounts,
                SUM(COALESCE(tax_amount, 0)) AS taxes
            FROM sales_daily_lines
            WHERE business_date BETWEEN %s AND %s
            GROUP BY business_date
            ORDER BY business_date ASC
            """,
            (start_date, end_date)
        )
        rows = cursor.fetchall() or []
        rows_by_day = {row['business_date']: row for row in rows}

        daily = []
        totals = {'qty_sold': 0.0, 'net_sales': 0.0, 'gross_sales': 0.0, 'discounts': 0.0, 'taxes': 0.0}
        for day in daterange(start_date, end_date):
            record = rows_by_day.get(day) or {}
            qty = float(record.get('qty_sold') or 0)
            net = float(record.get('net_sales') or 0)
            gross = float(record.get('gross_sales') or 0)
            disc = float(record.get('discounts') or 0)
            tax = float(record.get('taxes') or 0)
            entry = {
                'business_date': day.isoformat(),
                'qty_sold': qty,
                'net_sales': net,
                'gross_sales': gross,
                'discounts': disc,
                'taxes': tax,
                'avg_item_price': float(net / qty) if qty else 0.0
            }
            daily.append(entry)
            totals['qty_sold'] += qty
            totals['net_sales'] += net
            totals['gross_sales'] += gross
            totals['discounts'] += disc
            totals['taxes'] += tax

        span_days = len(daily) if daily else 0
        totals['avg_qty_per_day'] = totals['qty_sold'] / span_days if span_days else 0.0
        totals['avg_net_per_day'] = totals['net_sales'] / span_days if span_days else 0.0
        totals['avg_ticket'] = totals['net_sales'] / totals['qty_sold'] if totals['qty_sold'] else 0.0

        recent_window = min(7, span_days)
        recent_slice = daily[-recent_window:] if recent_window else []
        prev_slice = daily[-(recent_window * 2):-recent_window] if span_days >= recent_window * 2 and recent_window else []
        recent_avg_net = sum(d['net_sales'] for d in recent_slice) / recent_window if recent_slice else None
        prev_avg_net = sum(d['net_sales'] for d in prev_slice) / len(prev_slice) if prev_slice else None
        trend_pct = None
        if recent_avg_net is not None and prev_avg_net is not None and prev_avg_net != 0:
            trend_pct = ((recent_avg_net - prev_avg_net) / prev_avg_net) * 100

        payload = {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'days': span_days,
            'daily': daily,
            'totals': totals,
            'trend': {
                'recent_avg_net': recent_avg_net,
                'previous_avg_net': prev_avg_net,
                'trend_pct': trend_pct
            }
        }
        return jsonify(payload)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@sales_bp.route('/sales/items/<int:item_id>/daily', methods=['GET'])
def item_daily_sales(item_id):
    """Return sales for an individual item grouped by day to power forecasting."""
    today = date.today()
    end_date = parse_date_arg(request.args.get('end_date'), today)

    days_param = request.args.get('days')
    try:
        requested_days = int(days_param) if days_param else 60
    except ValueError:
        requested_days = 60
    requested_days = max(7, min(requested_days, 210))

    start_date = parse_date_arg(request.args.get('start_date'))
    if not start_date:
        start_date = end_date - timedelta(days=requested_days - 1)
    else:
        window = (end_date - start_date).days + 1
        if window > 210:
            start_date = end_date - timedelta(days=209)

    if start_date > end_date:
        start_date, end_date = end_date, start_date

    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT name FROM items WHERE item_id = %s", (item_id,))
        item_row = cursor.fetchone()
        item_name = item_row.get('name') if item_row else None

        where_clause = "item_id = %s"
        params = [item_id]
        if item_name:
            where_clause = f"({where_clause} OR (item_id IS NULL AND LOWER(TRIM(item_name)) = LOWER(TRIM(%s))))"
            params.append(item_name)
        params.extend([start_date, end_date])

        cursor.execute(
            f"""
            SELECT
                business_date,
                SUM(COALESCE(item_qty, 0)) AS qty_sold,
                SUM(COALESCE(net_sales, 0)) AS net_sales,
                SUM(COALESCE(gross_sales, 0)) AS gross_sales
            FROM sales_daily_lines
            WHERE {where_clause}
              AND business_date BETWEEN %s AND %s
            GROUP BY business_date
            ORDER BY business_date ASC
            """,
            tuple(params)
        )
        rows = cursor.fetchall() or []
        rows_by_day = {row['business_date']: row for row in rows}

        daily = []
        total_qty = 0.0
        total_net = 0.0
        last_sale_date = None
        for day in daterange(start_date, end_date):
            record = rows_by_day.get(day) or {}
            qty = float(record.get('qty_sold') or 0)
            net = float(record.get('net_sales') or 0)
            gross = float(record.get('gross_sales') or 0)
            entry = {
                'business_date': day.isoformat(),
                'qty_sold': qty,
                'net_sales': net,
                'gross_sales': gross,
                'avg_item_price': float(net / qty) if qty else 0.0
            }
            if qty > 0:
                last_sale_date = day.isoformat()
            daily.append(entry)
            total_qty += qty
            total_net += net

        span_days = len(daily) if daily else 0
        avg_qty_per_day = total_qty / span_days if span_days else 0.0
        avg_net_per_day = total_net / span_days if span_days else 0.0

        # Recent demand vs previous period for forecasting
        recent_window = min(7, span_days)
        recent_slice = daily[-recent_window:] if recent_window else []
        prev_slice = daily[-(recent_window * 2):-recent_window] if span_days >= recent_window * 2 and recent_window else []
        recent_avg_qty = sum(d['qty_sold'] for d in recent_slice) / recent_window if recent_slice else None
        prev_avg_qty = sum(d['qty_sold'] for d in prev_slice) / len(prev_slice) if prev_slice else None
        qty_trend_pct = None
        if recent_avg_qty is not None and prev_avg_qty is not None and prev_avg_qty != 0:
            qty_trend_pct = ((recent_avg_qty - prev_avg_qty) / prev_avg_qty) * 100

        positive_days = [d for d in daily if d['qty_sold'] > 0]
        best_day = max(positive_days, key=lambda d: d['qty_sold'], default=None)
        slowest_day = min(positive_days, key=lambda d: d['qty_sold'], default=None)

        forecast_qty = recent_avg_qty * 7 if recent_avg_qty is not None else avg_qty_per_day * 7

        payload = {
            'item_id': item_id,
            'item_name': item_name,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'days': span_days,
            'daily': daily,
            'summary': {
                'total_qty': total_qty,
                'total_net_sales': total_net,
                'avg_qty_per_day': avg_qty_per_day,
                'avg_net_per_day': avg_net_per_day,
                'recent_avg_qty': recent_avg_qty,
                'previous_avg_qty': prev_avg_qty,
                'qty_trend_pct': qty_trend_pct,
                'projected_next_week_qty': forecast_qty,
                'last_sale_date': last_sale_date,
                'busiest_day': best_day,
                'slowest_day': slowest_day
            }
        }
        return jsonify(payload)
    finally:
        try:
            cursor.close()
        except Exception:
            pass
