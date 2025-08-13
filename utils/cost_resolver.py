from datetime import date
from utils.db import get_db_cursor

def resolve_ingredient_cost(ingredient_id, recipe_unit, quantity=1):
    cursor = get_db_cursor()
    try:
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

        quote_unit = (quote.get("size_unit") or "").strip().lower()
        quote_qty = quote.get("size_qty")
        quote_price = quote.get("price")

        # Validate quote fields before doing any arithmetic
        try:
            quote_qty_val = float(quote_qty)
            quote_price_val = float(quote_price)
        except Exception:
            return {
                "status": "error",
                "issue": "invalid_quote_format",
                "message": "Missing or invalid size_qty or price fields",
                "ingredient_id": ingredient_id
            }

        if quote_qty_val == 0:
            return {
                "status": "error",
                "issue": "invalid_quote_quantity",
                "message": "Quote size_qty is zero",
                "ingredient_id": ingredient_id
            }

        price_per_unit = quote_price_val / quote_qty_val

        if not quote_unit:
            return {
                "status": "error",
                "issue": "invalid_quote_format",
                "message": "Missing or invalid size_unit field",
                "ingredient_id": ingredient_id
            }

        # Step 2: Handle conversions
        recipe_unit_norm = (recipe_unit or "").strip().lower()
        if quote_unit != recipe_unit_norm:
            cursor.execute("""
                SELECT factor FROM ingredient_conversions
                WHERE (ingredient_id = %s OR is_global = TRUE)
                AND from_unit = %s AND to_unit = %s
                ORDER BY ingredient_id NULLS LAST, from_unit, to_unit
                LIMIT 1
            """, (ingredient_id, quote_unit, recipe_unit_norm))
            conversion = cursor.fetchone()
            if not conversion:
                return {
                    "status": "error",
                    "issue": "missing_conversion",
                    "message": f"Missing conversion from {quote_unit} to {recipe_unit_norm}",
                    "missing": {
                        "ingredient_id": ingredient_id,
                        "from_unit": quote_unit,
                        "to_unit": recipe_unit_norm
                    }
                }
            try:
                conversion_factor = float(conversion.get("factor"))
            except Exception:
                return {
                    "status": "error",
                    "issue": "invalid_conversion_factor",
                    "message": "Conversion factor is invalid",
                    "conversion": conversion
                }
            # Apply conversion factor for price rates:
            # factor is (to_unit per 1 from_unit). Since price_per_unit is per from_unit,
            # price per to_unit = price per from_unit / factor.
            price_per_unit /= conversion_factor

        total_cost = price_per_unit * float(quantity)
        return {
            "status": "ok",
            "ingredient_id": ingredient_id,
            "recipe_unit": recipe_unit,
            "quantity": quantity,
            "cost_per_unit": round(price_per_unit, 4),
            "total_cost": round(total_cost, 4),
            "quote_date": quote.get("date_found"),
            "source": quote.get("source")
        }
    finally:
        try:
            cursor.close()
        except Exception:
            pass


def resolve_item_cost(item_id, recipe_unit, quantity=1, visited=None):
    cursor = get_db_cursor()
    try:
        visited = set(visited or [])
        if item_id in visited:
            return {
                "status": "error",
                "issue": "circular_dependency",
                "item_id": item_id
            }

        # Add current item to visited for this branch only
        visited.add(item_id)

        # Fetch the item details
        cursor.execute("SELECT * FROM items WHERE item_id = %s", (item_id,))
        item = cursor.fetchone()
        if not item or not item.get("is_prep"):
            return {
                "status": "error",
                "issue": "not_prep_item",
                "item_id": item_id
            }

        # Validate yield
        try:
            yield_qty = float(item.get("yield_qty"))
            yield_unit = (item.get("yield_unit") or "").strip().lower()
        except Exception:
            return {
                "status": "error",
                "issue": "missing_or_invalid_yield",
                "item_id": item_id
            }

        if yield_qty == 0:
            return {
                "status": "error",
                "issue": "zero_yield",
                "message": "Item has zero yield",
                "item_id": item_id
            }

        # Fetch recipe components
        cursor.execute("SELECT * FROM recipes WHERE item_id = %s", (item_id,))
        components = cursor.fetchall()

        total_cost = 0.0
        issues = []

        for c in components:
            if c.get("source_type") == "ingredient":
                cost = resolve_ingredient_cost(c.get("source_id"), c.get("unit"), c.get("quantity"))
            elif c.get("source_type") == "item":
                # Pass a copy of visited to child to avoid cross-branch pollution
                cost = resolve_item_cost(c.get("source_id"), c.get("unit"), c.get("quantity"), visited=set(visited))
            else:
                issues.append({"error": "unknown_source_type", "data": c})
                continue

            if cost.get("status") != "ok":
                issues.append(cost)
            else:
                # Expect child total_cost to be numeric
                try:
                    total_cost += float(cost.get("total_cost", 0))
                except Exception:
                    issues.append({"error": "invalid_child_cost", "child": cost})

        if issues:
            return {
                "status": "error",
                "issue": "child_resolution_error",
                "details": issues
            }

        # Unit conversion if needed (look up global conversions)
        recipe_unit_norm = (recipe_unit or "").strip().lower()
        if yield_unit != recipe_unit_norm:
            cursor.execute("""
                SELECT factor FROM ingredient_conversions
                WHERE is_global = TRUE AND from_unit = %s AND to_unit = %s
                LIMIT 1
            """, (yield_unit, recipe_unit_norm))
            conversion = cursor.fetchone()
            if not conversion:
                return {
                    "status": "error",
                    "issue": "missing_conversion",
                    "from": yield_unit,
                    "to": recipe_unit_norm
                }
            try:
                conversion_factor = float(conversion.get("factor"))
            except Exception:
                return {
                    "status": "error",
                    "issue": "invalid_conversion_factor",
                    "message": "Conversion factor is invalid",
                    "conversion": conversion
                }
        else:
            conversion_factor = 1.0

        effective_yield = yield_qty * conversion_factor
        if effective_yield == 0:
            return {
                "status": "error",
                "issue": "zero_effective_yield",
                "message": "Effective yield is zero after conversion",
                "item_id": item_id
            }

        cost_per_unit = total_cost / effective_yield
        final_cost = cost_per_unit * float(quantity)

        return {
            "status": "ok",
            "item_id": item_id,
            "recipe_unit": recipe_unit,
            "quantity": quantity,
            "cost_per_unit": round(cost_per_unit, 4),
            "total_cost": round(final_cost, 4)
        }
    finally:
        try:
            cursor.close()
        except Exception:
            pass
