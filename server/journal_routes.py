import csv
import hashlib
import io
import re
from collections import defaultdict
from datetime import datetime, date
from flask import Blueprint, jsonify, request
from .utils.db import get_db_cursor
from psycopg2.extras import Json
from .utils.cost_resolver import resolve_item_cost

journal_bp = Blueprint('journal', __name__, url_prefix='/api/journal')

UPLOAD_TYPES = {
    'revenue_summary',
    'category_summary',
    'tax_summary',
    'tip_summary',
    'discounts_summary',
    'void_summary',
    'cash_activity',
    'giftcard_activity',
    'processing_fees',
    'payments_summary'
}

CATEGORY_ENUM = {'food', 'liquor', 'beer', 'wine', 'misc'}
MAPPING_FLAG = {
    'revenue_summary': 'has_sales',
    'category_summary': 'has_sales',
    'tax_summary': 'has_tax',
    'tip_summary': 'has_tips',
    'discounts_summary': 'has_sales',
    'void_summary': 'has_sales',
    'cash_activity': 'has_sales',
    'giftcard_activity': 'has_giftcards',
    'processing_fees': 'has_fees',
    'payments_summary': None
}


def parse_numeric(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    try:
        txt = str(val).strip()
        if txt == '':
            return None
        cleaned = re.sub(r'[^0-9.\-]', '', txt)
        if cleaned == '':
            return None
        return float(cleaned)
    except Exception:
        return None


def decode_csv_payload():
    file = None
    filename = None
    raw = None
    notes = request.form.get('notes') if request.form else None
    business_date = request.form.get('business_date') if request.form else None

    if 'file' in request.files:
        file = request.files.get('file')
        filename = file.filename
        raw = file.read()
    else:
        payload = request.get_json() or {}
        raw_text = payload.get('csv')
        filename = payload.get('filename', 'upload.csv')
        notes = notes or payload.get('notes')
        business_date = business_date or payload.get('business_date')
        if not raw_text:
            return None, None, None, None, None
        raw = raw_text.encode('utf-8')

    if raw is None:
        return None, None, None, None, None

    try:
        text = raw.decode('utf-8')
    except Exception:
        try:
            text = raw.decode('latin-1')
        except Exception:
            return None, None, None, None, None

    return text, filename, raw, business_date, notes


def normalize_date(value, filename=None):
    if value:
        try:
            return datetime.strptime(str(value).replace('_', '-'), '%Y-%m-%d').date().isoformat()
        except Exception:
            pass
    if filename:
        m = re.search(r"(\d{4}[-_]\d{2}[-_]\d{2})", filename)
        if m:
            try:
                return datetime.strptime(m.group(1).replace('_', '-'), '%Y-%m-%d').date().isoformat()
            except Exception:
                return None
    return None


def ensure_business_day(cursor, business_date, flag=None):
    cursor.execute(
        """
        INSERT INTO business_days (business_date, status, created_at, updated_at)
        VALUES (%s, 'open', now(), now())
        ON CONFLICT (business_date) DO NOTHING
        """,
        (business_date,)
    )
    if flag:
        cursor.execute(
            f"""
            UPDATE business_days
            SET {flag} = TRUE, updated_at = now()
            WHERE business_date = %s
            """,
            (business_date,)
        )


def upsert_liabilities(cursor, business_date, payload):
    cursor.execute(
        """
        INSERT INTO liabilities_daily (
            business_date, tips_incurred, tips_paid, auto_grat_incurred,
            tax_collected, giftcard_sold, giftcard_redeemed, created_at, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, now(), now())
        ON CONFLICT (business_date) DO UPDATE
        SET tips_incurred = COALESCE(EXCLUDED.tips_incurred, liabilities_daily.tips_incurred),
            tips_paid = COALESCE(EXCLUDED.tips_paid, liabilities_daily.tips_paid),
            auto_grat_incurred = COALESCE(EXCLUDED.auto_grat_incurred, liabilities_daily.auto_grat_incurred),
            tax_collected = COALESCE(EXCLUDED.tax_collected, liabilities_daily.tax_collected),
            giftcard_sold = COALESCE(EXCLUDED.giftcard_sold, liabilities_daily.giftcard_sold),
            giftcard_redeemed = COALESCE(EXCLUDED.giftcard_redeemed, liabilities_daily.giftcard_redeemed),
            updated_at = now()
        """,
        (
            business_date,
            payload.get('tips_incurred'),
            payload.get('tips_paid'),
            payload.get('auto_grat_incurred'),
            payload.get('tax_collected'),
            payload.get('giftcard_sold'),
            payload.get('giftcard_redeemed')
        )
    )


def parse_category_summary(rows):
    parsed = []
    warnings = []
    for r in rows:
        category = (
            r.get('Category') or r.get('Sales Category') or r.get('Menu Group') or r.get('MenuGroup') or r.get('Category Name')
        )
        if not category:
            continue
        mapped = normalize_top_category(category)
        entry = {
            'category': mapped or str(category).strip(),
            'source_category': str(category).strip(),
            'gross_sales': parse_numeric(r.get('Gross Sales') or r.get('Gross sales') or r.get('Gross')),
            'discounts': parse_numeric(r.get('Discounts') or r.get('Discount amount') or r.get('Discount Amount')),
            'net_sales': parse_numeric(r.get('Net Sales') or r.get('Net sales') or r.get('Net Amount') or r.get('Net')),
            'tax': parse_numeric(r.get('Tax') or r.get('Tax Amount')),
            'tips': parse_numeric(r.get('Tips') or r.get('Tips / service charges') or r.get('Service Charges') or r.get('Service Charge')),
            'giftcard_redemptions': parse_numeric(r.get('Gift Card Redemption') or r.get('Giftcard Redemptions') or r.get('Gift Card Redeemed')),
            'auto_gratuity': parse_numeric(r.get('Auto Gratuity') or r.get('Auto-gratuity') or r.get('Auto Grat')),
            'refunds': parse_numeric(r.get('Refunds') or r.get('Refund Amount')),
            'voids': parse_numeric(r.get('Voids') or r.get('Void Amount'))
        }
        parsed.append(entry)
    if not parsed:
        warnings.append({'code': 'warn_empty_category_summary', 'severity': 'warn', 'message': 'No category rows parsed'})
    return parsed, warnings


def parse_tax_summary(rows):
    parsed = []
    total_tax = 0.0
    for r in rows:
        amt = parse_numeric(r.get('Tax') or r.get('Tax Amount') or r.get('Total Tax') or r.get('Sales Tax'))
        if amt is None:
            continue
        row = {'name': r.get('Name') or r.get('Rate') or 'tax', 'tax_collected': amt}
        parsed.append(row)
        total_tax += amt
    if not parsed and rows:
        parsed.append({'name': 'total', 'tax_collected': total_tax})
    return parsed, []


def parse_tip_summary(rows):
    parsed = []
    totals = {'tips_incurred': 0.0, 'tips_paid': 0.0, 'auto_grat_incurred': 0.0}
    for r in rows:
        tips_collected = parse_numeric(
            r.get('Tips') or r.get('Tips Amount') or r.get('Total Tips') or
            r.get('Tips collected') or r.get('Tips Collected')
        )
        tips_refunded = parse_numeric(r.get('Tips refunded') or r.get('Tips Refunded'))
        tips_total = parse_numeric(r.get('Total tips') or r.get('Total Tips'))
        tips = tips_total
        if tips is None:
            # If total not provided, compute: collected - refunded
            if tips_collected is not None or tips_refunded is not None:
                tips = (tips_collected or 0) - (tips_refunded or 0)
        paid = parse_numeric(r.get('Tips Paid') or r.get('Paid Out') or r.get('Tips paid'))
        auto_grat = parse_numeric(r.get('Auto Gratuity') or r.get('Auto- gratuity') or r.get('Service Charge'))
        parsed.append({
            'name': r.get('Name') or r.get('Tender') or 'tips',
            'tips_incurred': tips,
            'tips_paid': paid,
            'auto_grat': auto_grat,
            'tips_collected': tips_collected,
            'tips_refunded': tips_refunded
        })
        totals['tips_incurred'] += tips or 0
        totals['tips_paid'] += paid or 0
        totals['auto_grat_incurred'] += auto_grat or 0
    return parsed, totals


def parse_giftcard_activity(rows):
    parsed = []
    totals = {'giftcard_sold': 0.0, 'giftcard_redeemed': 0.0}
    for r in rows:
        sold = parse_numeric(r.get('Gift Card Sold') or r.get('Gift Cards Sold') or r.get('Giftcard Sold') or r.get('Giftcard Sales'))
        redeemed = parse_numeric(r.get('Gift Card Redeemed') or r.get('Gift Card Redemption') or r.get('Giftcard Redeemed'))
        parsed.append({'name': r.get('Name') or r.get('Type') or 'giftcard', 'giftcard_sold': sold, 'giftcard_redeemed': redeemed})
        totals['giftcard_sold'] += sold or 0
        totals['giftcard_redeemed'] += redeemed or 0
    return parsed, totals


def parse_cash_activity(rows):
    parsed = []
    for r in rows:
        tender = r.get('Tender') or r.get('Tender Type') or r.get('Payment Type') or 'tender'
        entry = {
            'tender': str(tender).strip().lower(),
            'gross': parse_numeric(r.get('Gross') or r.get('Gross Sales') or r.get('Gross Amount')),
            'less_tips': parse_numeric(r.get('Tips') or r.get('Tips Paid') or r.get('Tips Out')),
            'less_tax': parse_numeric(r.get('Tax') or r.get('Tax Amount')),
            'less_giftcard_liab': parse_numeric(r.get('Gift Card Sold') or r.get('Gift Cards Sold')),
            'fees': parse_numeric(r.get('Fees') or r.get('Processing Fees')),
            'expected_net_deposit': parse_numeric(r.get('Net Deposit') or r.get('Net Payout') or r.get('Expected'))
        }
        parsed.append(entry)
    return parsed, []


def parse_payments_summary(rows):
    parsed = []
    deposits = []
    liabilities = {'tips_incurred': 0.0, 'tips_paid': 0.0, 'auto_grat_incurred': 0.0, 'tax_collected': 0.0, 'giftcard_sold': 0.0, 'giftcard_redeemed': 0.0}
    for r in rows:
        ptype = (r.get('Payment type') or r.get('Payment Type') or '').strip()
        subtype = (r.get('Payment sub type') or r.get('Payment Sub Type') or '').strip()
        tender = ptype
        if subtype:
            tender = f"{ptype} - {subtype}"

        amount = parse_numeric(r.get('Amount'))
        tips = parse_numeric(r.get('Tips'))
        grat = parse_numeric(r.get('Grat') or r.get('Gratuity'))
        tax_amt = parse_numeric(r.get('Tax amount') or r.get('Tax Amount'))
        refunds = parse_numeric(r.get('Refunds'))
        tip_refunds = parse_numeric(r.get('Tip refunds') or r.get('Tip Refunds'))
        legacy_tips = parse_numeric(r.get('Legacy tips') or r.get('Legacy Tips'))
        total = parse_numeric(r.get('Total'))

        # Legacy tips are a fallback (older exports) not an additive; don't double-count with Tips.
        tip_base = tips if tips is not None else legacy_tips
        tips_total = (tip_base or 0) + (grat or 0) - (tip_refunds or 0)
        liabilities['tips_incurred'] += tips_total
        liabilities['tax_collected'] += tax_amt or 0
        if ptype.lower().startswith('gift'):
            liabilities['giftcard_sold'] += amount or 0

        less_gc = amount if ptype.lower().startswith('gift') else 0
        expected = None
        if amount is not None:
            expected = (amount or 0) - (tip_base or 0) - (tax_amt or 0) - (less_gc or 0) - (refunds or 0) + (tip_refunds or 0)

        deposits.append({
            'tender': tender,
            'gross': amount,
            'less_tips': tips,
            'less_tax': tax_amt,
            'less_giftcard_liab': less_gc,
            'fees': None,
            'expected_net_deposit': expected,
            'notes': None
        })

        parsed.append({
            'payment_type': ptype,
            'payment_sub_type': subtype,
            'amount': amount,
            'tips': tips,
            'grat': grat,
            'tax_amount': tax_amt,
            'refunds': refunds,
            'tip_refunds': tip_refunds,
            'legacy_tips': legacy_tips,
            'total': total,
            'computed_tips': tips_total
        })

    return parsed, deposits, liabilities


def parse_processing_fees(rows):
    parsed = []
    for r in rows:
        parsed.append({
            'provider': r.get('Provider') or r.get('Processor') or r.get('Source') or 'processor',
            'amount': parse_numeric(r.get('Amount') or r.get('Fee Amount') or r.get('Total Fees')),
            'basis': r.get('Basis') or r.get('Type') or r.get('Fee Type')
        })
    return parsed, []


def store_category_summary(cursor, business_date, parsed):
    for row in parsed:
        cursor.execute(
            """
            INSERT INTO sales_category_summary (
                business_date, category, gross_sales, discounts, net_sales, tax, tips,
                giftcard_redemptions, auto_gratuity, refunds, voids, data_source, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'upload', now(), now())
            ON CONFLICT (business_date, category) DO UPDATE SET
                gross_sales = EXCLUDED.gross_sales,
                discounts = EXCLUDED.discounts,
                net_sales = EXCLUDED.net_sales,
                tax = EXCLUDED.tax,
                tips = EXCLUDED.tips,
                giftcard_redemptions = EXCLUDED.giftcard_redemptions,
                auto_gratuity = EXCLUDED.auto_gratuity,
                refunds = EXCLUDED.refunds,
                voids = EXCLUDED.voids,
                updated_at = now()
            """,
            (
                business_date,
                row.get('category'),
                row.get('gross_sales'),
                row.get('discounts'),
                row.get('net_sales'),
                row.get('tax'),
                row.get('tips'),
                row.get('giftcard_redemptions'),
                row.get('auto_gratuity'),
                row.get('refunds'),
                row.get('voids')
            )
        )


@journal_bp.route('/upload/<upload_type>', methods=['POST'])
def upload(upload_type):
    upload_type = upload_type.strip().lower()
    if upload_type not in UPLOAD_TYPES:
        return jsonify({'error': 'Invalid upload type'}), 400

    text, filename, raw, business_date, notes = decode_csv_payload()
    if text is None:
        return jsonify({'error': 'No file uploaded or could not decode file'}), 400

    business_date = normalize_date(business_date, filename)
    if not business_date:
        return jsonify({'error': 'business_date is required (YYYY-MM-DD)'}), 400

    file_sha = hashlib.sha256(raw).hexdigest()
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    parsed = []
    warnings = []
    liabilities_update = {}
    deposits_rows = []
    fees_rows = []

    if upload_type in ('revenue_summary', 'category_summary'):
        parsed, warnings = parse_category_summary(rows)
    elif upload_type == 'tax_summary':
        parsed, warnings = parse_tax_summary(rows)
        total_tax = sum([p.get('tax_collected') or 0 for p in parsed])
        liabilities_update['tax_collected'] = total_tax
    elif upload_type == 'tip_summary':
        parsed, totals = parse_tip_summary(rows)
        liabilities_update.update(totals)
    elif upload_type == 'giftcard_activity':
        parsed, totals = parse_giftcard_activity(rows)
        liabilities_update.update(totals)
    elif upload_type == 'cash_activity':
        parsed, warnings = parse_cash_activity(rows)
        deposits_rows = parsed
    elif upload_type == 'processing_fees':
        parsed, warnings = parse_processing_fees(rows)
        fees_rows = parsed
    elif upload_type == 'payments_summary':
        parsed, deposits_rows, liabilities_update = parse_payments_summary(rows)
        # payments summary covers tips and tax; mark has_* after insert
    elif upload_type in ('discounts_summary', 'void_summary'):
        for r in rows:
            parsed.append({k: v for k, v in r.items()})

    cursor = get_db_cursor()
    try:
        ensure_business_day(cursor, business_date, MAPPING_FLAG.get(upload_type))

        cursor.execute(
            """
            INSERT INTO journal_uploads (
                upload_type, business_date, source_filename, file_sha256,
                raw_text, parsed_json, warnings, row_count, notes, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now())
            RETURNING id
            """,
            (
                upload_type,
                business_date,
                filename,
                file_sha,
                text,
                Json(parsed or None),
                Json(warnings or None),
                len(rows),
                notes
            )
        )
        upload_row = cursor.fetchone()

        if upload_type in ('revenue_summary', 'category_summary') and parsed:
            store_category_summary(cursor, business_date, parsed)

        if liabilities_update:
            upsert_liabilities(cursor, business_date, liabilities_update)
            # Mark flags for combined payment summary
            cursor.execute(
                """
                UPDATE business_days
                SET has_tips = TRUE,
                    has_tax = TRUE,
                    has_giftcards = CASE WHEN %s > 0 THEN TRUE ELSE has_giftcards END,
                    updated_at = now()
                WHERE business_date = %s
                """,
                (liabilities_update.get('giftcard_sold') or 0, business_date)
            )

        if deposits_rows:
            cursor.execute("DELETE FROM deposits_expected WHERE business_date = %s", (business_date,))
            for d in deposits_rows:
                cursor.execute(
                    """
                    INSERT INTO deposits_expected (
                        business_date, tender, gross, less_tips, less_tax, less_giftcard_liab,
                        fees, expected_net_deposit, notes, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, now(), now())
                    """,
                    (
                        business_date,
                        d.get('tender'),
                        d.get('gross'),
                        d.get('less_tips'),
                        d.get('less_tax'),
                        d.get('less_giftcard_liab'),
                        d.get('fees'),
                        d.get('expected_net_deposit')
                    )
                )

        if fees_rows:
            cursor.execute("DELETE FROM processing_fees_detail WHERE business_date = %s", (business_date,))
            for f in fees_rows:
                cursor.execute(
                    """
                    INSERT INTO processing_fees_detail (business_date, provider, amount, basis, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, now(), now())
                    """,
                    (business_date, f.get('provider'), f.get('amount'), f.get('basis'))
                )

        cursor.connection.commit()
        return jsonify({
            'status': 'ok',
            'upload_id': upload_row.get('id') if upload_row else None,
            'rows': len(rows),
            'warnings': warnings
        })
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


def load_latest_uploads(cursor, business_date):
    uploads = {}
    for t in UPLOAD_TYPES:
        cursor.execute(
            """
            SELECT * FROM journal_uploads
            WHERE business_date = %s AND upload_type = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (business_date, t)
        )
        row = cursor.fetchone()
        if row:
            uploads[t] = row
    return uploads


def normalize_top_category(raw):
    """Map raw category strings into top-level buckets using heuristics."""
    if not raw:
        return None
    norm = str(raw).strip().lower()
    if norm in CATEGORY_ENUM:
        return norm
    if 'beer' in norm:
        return 'beer'
    if 'wine' in norm:
        return 'wine'
    if 'liquor' in norm or 'spirit' in norm or 'cocktail' in norm:
        return 'liquor'
    if 'food' in norm or 'kitchen' in norm or 'entree' in norm or 'app' in norm or 'snack' in norm:
        return 'food'
    if 'misc' in norm or 'other' in norm:
        return 'misc'
    return None


def map_category(raw_category, item_id, category_map, item_map, warnings):
    if item_id and item_id in item_map:
        return item_map[item_id], False
    if raw_category:
        norm = str(raw_category).strip().lower()
        if norm in category_map:
            return category_map[norm], False
        heuristic = normalize_top_category(norm)
        if heuristic:
            return heuristic, False
    warnings.append('unmapped')
    return 'misc', True


def compute_cogs(cursor, business_date, category_map, item_map):
    cursor.execute(
        """
        SELECT item_id, item_name, sales_category, item_qty, net_sales
        FROM sales_daily_lines
        WHERE business_date = %s
        """,
        (business_date,)
    )
    rows = cursor.fetchall() or []

    item_ids = [r['item_id'] for r in rows if r.get('item_id')]
    items_info = {}
    if item_ids:
        cursor.execute(
            """
            SELECT item_id, cost, yield_unit
            FROM items
            WHERE item_id = ANY(%s)
            """,
            (item_ids,)
        )
        for it in cursor.fetchall() or []:
            items_info[it['item_id']] = it

    per_item_cost = {}
    for it_id, info in items_info.items():
        cost = info.get('cost')
        if cost is not None:
            per_item_cost[it_id] = float(cost)
            continue
        unit = info.get('yield_unit') or 'each'
        res = resolve_item_cost(it_id, unit, 1)
        if isinstance(res, dict) and res.get('status') == 'ok':
            per_item_cost[it_id] = float(res.get('cost_per_unit'))

    cat_cogs = defaultdict(float)
    missing_sales_dollars = 0.0
    total_sales = 0.0
    for r in rows:
        qty = r.get('item_qty') or 0
        net = float(r.get('net_sales') or 0)
        total_sales += net
        item_id = r.get('item_id')
        cat, _ = map_category(r.get('sales_category'), item_id, category_map, item_map, [])
        if item_id and item_id in per_item_cost and qty:
            cat_cogs[cat] += per_item_cost[item_id] * float(qty)
        else:
            missing_sales_dollars += net

    cogs_rows = []
    for cat, val in cat_cogs.items():
        cogs_rows.append({'category': cat, 'estimated_cogs': round(val, 2), 'source': 'theoretical', 'calc_method': 'recipe'})
    return cogs_rows, total_sales, missing_sales_dollars


def aggregate_sales_fallback(cursor, business_date, category_map, item_map):
    cursor.execute(
        """
        SELECT sales_category, item_id, item_name, item_qty, net_sales, discount_amount, gross_sales
        FROM sales_daily_lines
        WHERE business_date = %s
        """,
        (business_date,)
    )
    rows = cursor.fetchall() or []
    warnings = []
    agg = defaultdict(lambda: {'category': None, 'gross_sales': 0.0, 'discounts': 0.0, 'net_sales': 0.0})
    for r in rows:
        cat, unmapped = map_category(r.get('sales_category'), r.get('item_id'), category_map, item_map, warnings)
        entry = agg[cat]
        entry['category'] = cat
        entry['gross_sales'] += float(r.get('gross_sales') or 0)
        entry['discounts'] += float(r.get('discount_amount') or 0)
        entry['net_sales'] += float(r.get('net_sales') or 0)
    return list(agg.values()), warnings.count('unmapped')


def compute_expected_deposits(cursor, business_date, liabilities, revenue_total, fees_total, uploads):
    cursor.execute(
        "SELECT * FROM deposits_expected WHERE business_date = %s",
        (business_date,)
    )
    rows = cursor.fetchall() or []
    if rows:
        return [
            {
                'tender': r.get('tender'),
                'expected': r.get('expected_net_deposit') or 0,
                'gross': r.get('gross'),
                'less_tips': r.get('less_tips'),
                'less_tax': r.get('less_tax'),
                'less_giftcard_liab': r.get('less_giftcard_liab'),
                'fees': r.get('fees')
            } for r in rows
        ], []

    tips = liabilities.get('tips_incurred') or 0
    tax = liabilities.get('tax_collected') or 0
    gift_sold = liabilities.get('giftcard_sold') or 0
    gift_red = liabilities.get('giftcard_redeemed') or 0
    # revenue_total is net sales (excludes tips). For fallback, assume tips are deposited with card batches.
    expected_total = (revenue_total or 0) + tips - tax - gift_sold + gift_red - (fees_total or 0)
    warnings = []
    if not uploads.get('cash_activity'):
        warnings.append({'code': 'warn_missing_cash_activity', 'severity': 'warn', 'message': 'Cash/deposit detail missing; using single aggregate expected deposit.'})
    return [{'tender': 'card', 'expected': round(expected_total, 2)}], warnings


def fetch_processing_fees(cursor, business_date):
    cursor.execute("SELECT SUM(amount) AS total FROM processing_fees_detail WHERE business_date = %s", (business_date,))
    row = cursor.fetchone() or {}
    total = float(row.get('total') or 0)
    return total


def compute_journal_packet(business_date):
    cursor = get_db_cursor()
    warnings = []
    blocking = []
    try:
        cursor.execute("SELECT * FROM business_days WHERE business_date = %s", (business_date,))
        bd = cursor.fetchone() or {}

        uploads = load_latest_uploads(cursor, business_date)
        has_sales_upload = bool(uploads.get('revenue_summary') or uploads.get('category_summary'))
        if not has_sales_upload:
            cursor.execute("SELECT 1 FROM sales_daily_lines WHERE business_date = %s LIMIT 1", (business_date,))
            has_sales_upload = bool(cursor.fetchone())
        has_payments_summary = bool(uploads.get('payments_summary'))
        completeness = {
            'sales': has_sales_upload,
            'payments_summary': has_payments_summary,
            # Payments summary includes tax/tips/giftcards/fees, so mark those complete when it exists
            'tax': bool(uploads.get('tax_summary') or has_payments_summary),
            'tips': bool(uploads.get('tip_summary') or has_payments_summary),
            'giftcards': bool(uploads.get('giftcard_activity') or has_payments_summary),
            'fees': bool(uploads.get('processing_fees') or has_payments_summary)
        }

        # Only block on missing product mix (sales) and payments summary; the others become optional
        if not completeness['sales']:
            blocking.append({'code': 'err_missing_sales', 'severity': 'error', 'message': 'Sales/category upload missing.'})
        if not completeness['payments_summary']:
            blocking.append({'code': 'err_missing_payments_summary', 'severity': 'error', 'message': 'Payments summary missing.'})

        # Category mappings
        cursor.execute("SELECT source_category, mapped_category FROM sales_category_mappings")
        category_map = {r['source_category'].strip().lower(): r['mapped_category'].strip().lower() for r in cursor.fetchall() or []}
        cursor.execute("SELECT item_id, mapped_category FROM sales_item_category_overrides")
        item_map = {r['item_id']: r['mapped_category'].strip().lower() for r in cursor.fetchall() or []}

        # Revenue aggregation
        revenue_rows = []
        unmapped_count = 0
        uploaded_rev = uploads.get('category_summary') or uploads.get('revenue_summary')
        if uploaded_rev:
            data = uploaded_rev.get('parsed_json') or []
            for r in data:
                raw_cat = r.get('category') or r.get('source_category')
                mapped_cat = map_category(raw_cat, None, category_map, item_map, warnings)[0]
                revenue_rows.append({
                    'category': mapped_cat,
                    'source_category': raw_cat,
                    'net_sales': r.get('net_sales'),
                    'gross_sales': r.get('gross_sales'),
                    'discounts': r.get('discounts')
                })
        else:
            revenue_rows, unmapped_count = aggregate_sales_fallback(cursor, business_date, category_map, item_map)
            if unmapped_count:
                warnings.append({'code': 'warn_unmapped_category', 'severity': 'warn', 'message': f'{unmapped_count} rows mapped to Misc'})

        revenue_total = sum([float(r.get('net_sales') or 0) for r in revenue_rows])

        # COGS estimates removed from closeout journal; keep revenue_total for deposits/liabilities
        cogs_rows = []

        # Liabilities
        cursor.execute("SELECT * FROM liabilities_daily WHERE business_date = %s", (business_date,))
        liab = cursor.fetchone() or {}
        if not liab and uploads.get('tip_summary') is None and not has_payments_summary:
            warnings.append({'code': 'warn_missing_tip_summary', 'severity': 'warn', 'message': 'Tip summary missing; liabilities may be understated.'})
        if not liab and uploads.get('tax_summary') is None and not has_payments_summary:
            warnings.append({'code': 'warn_missing_tax_summary', 'severity': 'warn', 'message': 'Tax summary missing.'})

        # Processing fees
        fee_total = fetch_processing_fees(cursor, business_date)
        if fee_total == 0 and not uploads.get('processing_fees') and not has_payments_summary:
            warnings.append({'code': 'warn_missing_fees', 'severity': 'warn', 'message': 'Processing fees feed missing; deposit estimate excludes fees.'})

        expected_deposits, deposit_warnings = compute_expected_deposits(cursor, business_date, liab, revenue_total, fee_total, uploads)
        warnings.extend(deposit_warnings)

        # Fees payload
        fees_block = {'processing_fees': fee_total, 'source': 'processing_fees_detail' if fee_total else None}

        journal_lines = []
        # Deposits (assets)
        for d in expected_deposits or []:
            expected_amt = d.get('expected')
            if expected_amt is None:
                continue
            tender = (d.get('tender') or '').strip()
            acct = 'Petty Cash' if 'cash' in tender.lower() else f"{tender.title()} Deposits Receivable" if tender else 'Deposits Receivable'
            journal_lines.append({'account': acct, 'type': 'debit', 'amount': round(float(expected_amt), 2)})

        for r in revenue_rows:
            amt = r.get('net_sales')
            if amt:
                acct = f"{str(r.get('category') or '').title()} Sales"
                journal_lines.append({'account': acct, 'type': 'credit', 'amount': round(float(amt), 2)})
        if liab.get('tips_incurred'):
            tips_amt = round(float(liab.get('tips_incurred')), 2)
            # Payout tips daily from petty cash: clear liability and reduce cash
            journal_lines.append({'account': 'Tips Payable', 'type': 'debit', 'amount': tips_amt})
            journal_lines.append({'account': 'Petty Cash', 'type': 'credit', 'amount': tips_amt})
        if liab.get('auto_grat_incurred'):
            journal_lines.append({'account': 'Auto Gratuity Payable', 'type': 'credit', 'amount': round(float(liab.get('auto_grat_incurred')), 2)})
        if liab.get('tax_collected'):
            journal_lines.append({'account': 'Sales Tax Payable', 'type': 'credit', 'amount': round(float(liab.get('tax_collected')), 2)})
        if liab.get('giftcard_sold'):
            journal_lines.append({'account': 'Gift Card Liability', 'type': 'credit', 'amount': round(float(liab.get('giftcard_sold')), 2)})
        if liab.get('giftcard_redeemed'):
            journal_lines.append({'account': 'Gift Card Liability', 'type': 'debit', 'amount': round(float(liab.get('giftcard_redeemed')), 2)})
        if fee_total:
            journal_lines.append({'account': 'Processing Fees', 'type': 'debit', 'amount': round(float(fee_total), 2)})

        # Validate journal balance
        debit_total = sum(float(l.get('amount') or 0) for l in journal_lines if (l.get('type') or '').lower() == 'debit')
        credit_total = sum(float(l.get('amount') or 0) for l in journal_lines if (l.get('type') or '').lower() == 'credit')
        if abs(debit_total - credit_total) > 0.01:
            warnings.append({'code': 'warn_unbalanced_journal', 'severity': 'warn', 'message': f'Journal not balanced (debits {debit_total:.2f} vs credits {credit_total:.2f}).'})

        packet = {
            'business_date': business_date,
            'status': bd.get('status') or 'open',
            'completeness': completeness,
            'warnings': warnings + blocking,
            'revenue': revenue_rows,
            'cogs': cogs_rows,
            'liabilities': {
                'tips_incurred': liab.get('tips_incurred'),
                'tips_paid': liab.get('tips_paid'),
                'auto_grat': liab.get('auto_grat_incurred'),
                'tax_collected': liab.get('tax_collected'),
                'giftcard_sold': liab.get('giftcard_sold'),
                'giftcard_redeemed': liab.get('giftcard_redeemed')
            },
            'fees': fees_block,
            'expected_deposits': expected_deposits,
            'journal_lines_ready_for_xero': journal_lines
        }
        return packet, warnings, blocking
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@journal_bp.route('/daily', methods=['GET'])
def get_daily_packet():
    business_date = request.args.get('business_date')
    if not business_date:
        return jsonify({'error': 'business_date required'}), 400
    packet, warnings, blocking = compute_journal_packet(business_date)
    return jsonify(packet)


@journal_bp.route('/uploads', methods=['GET'])
def list_journal_uploads():
    """List journal uploads for a business_date (or recent). Useful for manual review."""
    business_date = request.args.get('business_date')
    cursor = get_db_cursor()
    try:
        if business_date:
            cursor.execute(
                """
                SELECT id, upload_type, business_date, source_filename, row_count, created_at
                FROM journal_uploads
                WHERE business_date = %s
                ORDER BY created_at DESC
                """,
                (business_date,)
            )
        else:
            cursor.execute(
                """
                SELECT id, upload_type, business_date, source_filename, row_count, created_at
                FROM journal_uploads
                ORDER BY created_at DESC
                LIMIT 50
                """
            )
        return jsonify(cursor.fetchall() or [])
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@journal_bp.route('/uploads/<int:upload_id>', methods=['GET'])
def get_journal_upload(upload_id):
    """Return raw/parsed journal upload to aid manual verification."""
    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT * FROM journal_uploads WHERE id = %s", (upload_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'not found'}), 404
        return jsonify(row)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@journal_bp.route('/uploads/<int:upload_id>/reverse', methods=['POST'])
def reverse_journal_upload(upload_id):
    """Delete journal_uploads row and dependent aggregates for that business_date."""
    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT * FROM journal_uploads WHERE id = %s", (upload_id,))
        upload = cursor.fetchone()
        if not upload:
            return jsonify({'error': 'Upload not found'}), 404

        bdate = upload.get('business_date')
        utype = (upload.get('upload_type') or '').lower()

        # Remove derived rows depending on type
        if utype in ('revenue_summary', 'category_summary'):
            cursor.execute("DELETE FROM sales_category_summary WHERE business_date = %s", (bdate,))
        if utype in ('tip_summary', 'payments_summary'):
            cursor.execute("DELETE FROM liabilities_daily WHERE business_date = %s", (bdate,))
        if utype in ('giftcard_activity',):
            cursor.execute("UPDATE liabilities_daily SET giftcard_sold = NULL, giftcard_redeemed = NULL WHERE business_date = %s", (bdate,))
        if utype in ('cash_activity', 'payments_summary'):
            cursor.execute("DELETE FROM deposits_expected WHERE business_date = %s", (bdate,))
        if utype in ('processing_fees',):
            cursor.execute("DELETE FROM processing_fees_detail WHERE business_date = %s", (bdate,))

        cursor.execute("DELETE FROM journal_uploads WHERE id = %s", (upload_id,))
        cursor.connection.commit()
        return jsonify({'status': 'ok', 'deleted': True, 'business_date': bdate, 'upload_type': utype})
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


@journal_bp.route('/validate', methods=['POST'])
def validate_day():
    data = request.get_json() or {}
    business_date = data.get('business_date')
    if not business_date:
        return jsonify({'error': 'business_date required'}), 400
    packet, warnings, blocking = compute_journal_packet(business_date)
    return jsonify({'status': 'ok', 'warnings': warnings, 'blocking': blocking, 'completeness': packet.get('completeness')})


@journal_bp.route('/lock', methods=['POST'])
def lock_day():
    data = request.get_json() or {}
    business_date = data.get('business_date')
    if not business_date:
        return jsonify({'error': 'business_date required'}), 400
    packet, warnings, blocking = compute_journal_packet(business_date)
    if blocking:
        return jsonify({'error': 'Blocking issues prevent lock', 'blocking': blocking}), 400

    cursor = get_db_cursor()
    try:
        ensure_business_day(cursor, business_date, None)
        cursor.execute(
            """
            UPDATE business_days
            SET status = 'locked', locked_at = now(),
                has_sales = %s, has_tax = %s, has_tips = %s, has_giftcards = %s, has_fees = %s,
                updated_at = now()
            WHERE business_date = %s
            """,
            (
                packet['completeness'].get('sales'),
                packet['completeness'].get('tax'),
                packet['completeness'].get('tips'),
                packet['completeness'].get('giftcards'),
                packet['completeness'].get('fees'),
                business_date
            )
        )

        cursor.execute(
            """
            INSERT INTO journal_packets (business_date, status, packet, warnings, created_at, updated_at)
            VALUES (%s, %s, %s, %s, now(), now())
            ON CONFLICT (business_date) DO UPDATE SET
                status = EXCLUDED.status,
                packet = EXCLUDED.packet,
                warnings = EXCLUDED.warnings,
                updated_at = now()
            """,
            (business_date, 'locked', Json(packet), Json(warnings))
        )

        cursor.execute("DELETE FROM cogs_estimates WHERE business_date = %s", (business_date,))
        for c in packet.get('cogs') or []:
            cursor.execute(
                """
                INSERT INTO cogs_estimates (business_date, category, estimated_cogs, source, calc_method, issues, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, now(), now())
                ON CONFLICT (business_date, category) DO UPDATE SET
                    estimated_cogs = EXCLUDED.estimated_cogs,
                    source = EXCLUDED.source,
                    calc_method = EXCLUDED.calc_method,
                    issues = EXCLUDED.issues,
                    updated_at = now()
                """,
                (
                    business_date,
                    c.get('category'),
                    c.get('estimated_cogs'),
                    c.get('source'),
                    c.get('calc_method'),
                    Json(c.get('issues'))
                )
            )

        cursor.execute("DELETE FROM journal_warnings WHERE business_date = %s", (business_date,))
        for w in warnings:
            cursor.execute(
                """
                INSERT INTO journal_warnings (business_date, code, severity, message, context, created_at)
                VALUES (%s, %s, %s, %s, %s, now())
                """,
                (business_date, w.get('code'), w.get('severity') or 'warn', w.get('message'), None)
            )

        cursor.connection.commit()
        return jsonify({'status': 'locked', 'packet': packet})
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
