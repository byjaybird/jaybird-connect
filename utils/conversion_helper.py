from utils.db import get_db_cursor

# Converts a quantity from one unit to another specified by conversion factors stored in the database.

def reverse_convert_from_base(source_id, source_type, to_unit, quantity_base):
    """
    Reverse the conversion to obtain the original quantity from the base quantity.
    Fetches the conversion factor from the database to perform this calculation.

    :param source_id: The ID of the ingredient or item.
    :param source_type: The type (ingredient or item) for determining the conversion context.
    :param to_unit: The unit to which we wish to convert from the base.
    :param quantity_base: The base quantity to be converted back into the original unit.
    :return: The original quantity in the specified unit and the original unit.
    """
    cursor = get_db_cursor()
    try:
        # Look up the conversion factor needed to revert from the base unit
        cursor.execute('''
            SELECT factor
            FROM ingredient_conversions
            WHERE (ingredient_id = %s OR is_global = TRUE)
            AND to_unit = %s
            LIMIT 1
        ''', (source_id, to_unit))
        conversion = cursor.fetchone()

        if not conversion:
            return quantity_base, to_unit  # No conversion found, return base quantity

        # Calculate the original quantity from the base quantity using the inverse factor
        conversion_factor = conversion['factor']
        original_quantity = quantity_base / conversion_factor

        # For demonstration, we'll assume conversion is to a base unit named 'base_unit'
        original_unit = 'base_unit'

        return original_quantity, original_unit

    finally:
        cursor.close()

def convert_to_base(source_id, source_type, from_unit, quantity):
    cursor = get_db_cursor()
    try:
        # Attempt to find a conversion factor for this source
        cursor.execute('''
            SELECT factor
            FROM ingredient_conversions
            WHERE (ingredient_id = %s OR is_global = TRUE)
            AND from_unit = %s
        	LIMIT 1
        ''', (source_id, from_unit))
        conversion = cursor.fetchone()

        if not conversion:
            return quantity, from_unit  # No conversion, return original values

        # Calculate base quantity using conversion factor
        conversion_factor = conversion['factor']
        quantity_base = quantity * conversion_factor

        # Assume the conversion factor standardizes to a base unit, here we simply demonstrate with 'base_unit'
        base_unit = 'base_unit'

        return quantity_base, base_unit

    finally:
        cursor.close()