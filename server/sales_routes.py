from flask import Blueprint, request, jsonify
from .utils.db import get_db_cursor
import csv
import io
import re
import hashlib
from decimal import Decimal, InvalidOperation
from datetime import datetime

sales_bp = Blueprint('sales', __name__, url_prefix='/api')

ID_FIELDS = ['Master ID', 'Item ID', 'Parent ID']


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
        if not csv_text:
            return jsonify({'error': 'No file uploaded'}), 400
        text = csv_text
        raw = text.encode('utf-8')

    # compute sha256
    file_sha = hashlib.sha256(raw).hexdigest()

    # try to extract business_date from filename if not supplied
    if not business_date:
        m = re.search(r"(\d{4}_\d{2}_\d{2})", filename)
        if m:
            try:
                business_date = datetime.strptime(m.group(1), '%Y_%m_%d').date().isoformat()
            except Exception:
                business_date = None

    # parse CSV
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    # filter rows where Menu Item is present
    filtered = []
    for r in rows:
        menu_item = r.get('Menu Item') or r.get('MenuItem') or r.get('Menu_Item')
        if menu_item is None:
            continue
        if str(menu_item).strip() == '':
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
            master_id = normalize_id(r.get('Master ID') or r.get('MasterID') or r.get('master_id'))
            item_id_text = normalize_id(r.get('Item ID') or r.get('ItemID') or r.get('item_id'))
            parent_id = normalize_id(r.get('Parent ID') or r.get('ParentID') or r.get('parent_id'))
            menu_name = r.get('Menu Name') or r.get('MenuName')
            menu_group = r.get('Menu Group') or r.get('MenuGroup')
            subgroup = r.get('Subgroup')
            menu_item = r.get('Menu Item')
            avg_price = parse_numeric(r.get('Avg Price') or r.get('AvgPrice'))
            item_qty = parse_numeric(r.get('Item Qty') or r.get('ItemQty') or r.get('Item_Qty'))
            gross_amount = parse_numeric(r.get('Gross Amount') or r.get('GrossAmount'))
            void_qty = parse_numeric(r.get('Void Qty') or r.get('VoidQty'))
            discount_amount = parse_numeric(r.get('Discount Amount') or r.get('DiscountAmount'))
            net_amount = parse_numeric(r.get('Net Amount') or r.get('NetAmount'))

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
                    menu_group or menu_name,
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
