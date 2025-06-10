from datetime import date
from utils.db import get_db_cursor

def resolve_ingredient_cost(ingredient_id, recipe_unit, quantity=1):
    cursor = get_db_cursor()

    # Step 1: Get most recent price quote
    cursor.execute("""
        SELECT * FROM price_quotes
        WHERE ingredient_id = %s
        ORDER BY date_found DESC
        LIMIT 1
    """, (ingredient_id,))
    quote = cursor.fetchone()
    if not quote:
        return {
            "status": "error",
            "issue": "missing_price",
            "message": "No price quote found for this ingredient",
            "ingredient_id": ingredient_id
        }

    quote_unit = quote.get("size_unit", "").lower()
    quote_qty = quote.get("size_qty", None)
    price_per_unit = quote["price"] / quote_qty

    if not quote_unit or not quote_qty:
        return {
            "status": "error",
                    "issue": "invalid_quote_format",
            "message": "Missing or invalid size_qty or size_unit fields",
            "ingredient_id": ingredient_id
        }

    # Step 2: Handle conversions
    if quote_unit != recipe_unit:
        cursor.execute("""
            SELECT factor FROM ingredient_conversions
            WHERE (ingredient_id = %s OR is_global = TRUE)
            AND from_unit = %s AND to_unit = %s
            ORDER BY ingredient_id NULLS LAST, from_unit, to_unit
            LIMIT 1
        """, (ingredient_id, quote_unit, recipe_unit))  # Correct order of 'from' and 'to' in the parameters
        conversion = cursor.fetchone()
        if not conversion:
            return {
                "status": "error",
                "issue": "missing_conversion",
                "message": f"Missing conversion from {quote_unit} to {recipe_unit}",
                "missing": {
                    "ingredient_id": ingredient_id,
                    "from_unit": quote_unit,
                    "to_unit": recipe_unit
                }
            }
        conversion_factor = conversion["factor"]
        # Correct the direction of the conversion
        price_per_unit *= conversion_factor

    total_cost = price_per_unit * quantity
    return {
        "status": "ok",
                "ingredient_id": ingredient_id,
        "recipe_unit": recipe_unit,
        "quantity": quantity,
        "cost_per_unit": round(price_per_unit, 4),
        "total_cost": round(total_cost, 4),
        "quote_date": quote["date_found"],
        "source": quote["source"]
    }

def resolve_item_cost(item_id, recipe_unit, quantity=1, visited=None):
    cursor = get_db_cursor()

    visited = visited or set()
    if item_id in visited:
        return {
            "status": "error",
            "issue": "circular_dependency",
            "item_id": item_id
        }

    visited.add(item_id)

    # Fetch the item details
    cursor.execute("SELECT * FROM items WHERE item_id = %s", (item_id,))
    item = cursor.fetchone()
    if not item or not item["is_prep"]:
        return {
            "status": "error",
            "issue": "not_prep_item",
            "item_id": item_id
        }

    try:
        yield_qty = float(item["yield_qty"])
        yield_unit = item["yield_unit"].strip().lower()
    except:
        return {
            "status": "error",
            "issue": "missing_or_invalid_yield",
            "item_id": item_id
        }

    # Fetch recipe components
    cursor.execute("SELECT * FROM recipes WHERE item_id = %s", (item_id,))
    components = cursor.fetchall()

    total_cost = 0
    issues = []

    for c in components:
        if c["source_type"] == "ingredient":
            cost = resolve_ingredient_cost(c["source_id"], c["unit"], c["quantity"])
        elif c["source_type"] == "item":
            cost = resolve_item_cost(c["source_id"], c["unit"], c["quantity"], visited=visited)
        else:
            issues.append({"error": "unknown_source_type", "data": c})
            continue

        if cost["status"] != "ok":
            issues.append(cost)
        else:
            total_cost += cost["total_cost"]

    if issues:
        return {
            "status": "error",
            "issue": "child_resolution_error",
            "details": issues
        }

    # Unit conversion if needed
    if yield_unit != recipe_unit:
        cursor.execute("""
            SELECT factor FROM ingredient_conversions
            WHERE (ingredient_id IS NULL AND is_global = TRUE)
            AND from_unit = %s AND to_unit = %s
            LIMIT 1
        """, (yield_unit, recipe_unit))
        conversion = cursor.fetchone()
        if not conversion:
            return {
                "status": "error",
                "issue": "missing_conversion",
                "from": yield_unit,
                "to": recipe_unit
            }
        conversion_factor = conversion["factor"]
    else:
        conversion_factor = 1

    effective_yield = yield_qty * conversion_factor
    cost_per_unit = total_cost / effective_yield
    final_cost = cost_per_unit * quantity

    return {
        "status": "ok",
        "item_id": item_id,
        "recipe_unit": recipe_unit,
        "quantity": quantity,
        "cost_per_unit": round(cost_per_unit, 4),
        "total_cost": round(final_cost, 4)
    }


