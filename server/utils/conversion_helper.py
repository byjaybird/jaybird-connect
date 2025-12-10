from .db import get_db_cursor


def _normalize_unit(u):
    if u is None:
        return None
    try:
        return str(u).strip().lower()
    except Exception:
        return u


def convert_to_base(source_id, source_type, from_unit, quantity):
    """Convert a quantity from from_unit to the base unit using ingredient_conversions.

    This function is defensive: it normalizes unit strings for lookup, coerces numeric
    quantities to float before arithmetic, and falls back to returning the original
    quantity/unit if conversion can't be applied.
    """
    cursor = get_db_cursor()
    try:
        norm_from = _normalize_unit(from_unit)
        cursor.execute('''
            SELECT factor, to_unit
            FROM ingredient_conversions
            WHERE (ingredient_id = %s OR is_global = TRUE)
            AND LOWER(from_unit) = %s
            LIMIT 1
        ''', (source_id, norm_from))
        conversion = cursor.fetchone()

        if not conversion:
            # No conversion found - return original quantity/unit (caller may coerce to float)
            return quantity, from_unit

        # Coerce values to numbers where possible
        try:
            qty_num = float(quantity)
        except Exception:
            # Can't coerce quantity to float - fall back to returning original
            return quantity, from_unit

        try:
            factor = float(conversion['factor'])
        except Exception:
            # Invalid factor stored - fall back
            return quantity, from_unit

        quantity_base = qty_num * factor
        return quantity_base, conversion['to_unit']
    finally:
        cursor.close()


def reverse_convert_from_base(source_id, source_type, to_unit, quantity_base):
    cursor = get_db_cursor()
    try:
        norm_to = _normalize_unit(to_unit)
        cursor.execute('''
            SELECT factor, from_unit
            FROM ingredient_conversions
            WHERE (ingredient_id = %s OR is_global = TRUE)
            AND LOWER(to_unit) = %s
            LIMIT 1
        ''', (source_id, norm_to))
        conversion = cursor.fetchone()

        if not conversion:
            return quantity_base, to_unit

        try:
            factor = float(conversion['factor'])
            original_quantity = float(quantity_base) / factor
        except Exception:
            return quantity_base, to_unit

        return original_quantity, conversion['from_unit']
    finally:
        cursor.close()
