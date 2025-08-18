from .db import get_db_cursor

def convert_to_base(source_id, source_type, from_unit, quantity):
    cursor = get_db_cursor()
    try:
        cursor.execute('''
            SELECT factor, to_unit
            FROM ingredient_conversions
            WHERE (ingredient_id = %s OR is_global = TRUE)
            AND from_unit = %s
            LIMIT 1
        ''', (source_id, from_unit))
        conversion = cursor.fetchone()

        if not conversion:
            return quantity, from_unit
        conversion_factor = conversion['factor']
        quantity_base = quantity * conversion_factor

        return quantity_base, conversion['to_unit']
    finally:
        cursor.close()

def reverse_convert_from_base(source_id, source_type, to_unit, quantity_base):
    cursor = get_db_cursor()
    try:
        cursor.execute('''
            SELECT factor, from_unit
            FROM ingredient_conversions
            WHERE (ingredient_id = %s OR is_global = TRUE)
            AND to_unit = %s
            LIMIT 1
        ''', (source_id, to_unit))
        conversion = cursor.fetchone()

        if not conversion:
            return quantity_base, to_unit
        conversion_factor = conversion['factor']
        original_quantity = quantity_base / conversion_factor

        return original_quantity, conversion['from_unit']
    finally:
        cursor.close()
