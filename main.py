from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import psycopg2
import psycopg2.extras
from psycopg2.extras import RealDictCursor
from datetime import datetime
from utils.cost_resolver import resolve_ingredient_cost
from utils.cost_resolver import resolve_item_cost
from utils.db import get_db_cursor
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
CORS(app)

try:
    test_conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD")
    )
    test_conn.close()
    print("✅ Initial DB connection successful.")
except Exception as e:
    print("❌ DB connection failed on startup:", e)
        
def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        cursor_factory=psycopg2.extras.RealDictCursor
    )

def parse_float(val):
    try:
        return float(val)
    except (TypeError, ValueError):
        return None

@app.route('/')
def index():
    return "Food Cost Tracker API Running"

@app.route('/api/log-login', methods=['POST'])
def log_login():
    data = request.get_json()
    cursor = get_db_cursor()
    cursor.execute('''
        INSERT INTO login_logs (email, name, domain, timestamp)
        VALUES (%s, %s, %s, %s)
    ''', (data.get('email'), data.get('name'), data.get('domain'), data.get('timestamp')))
    cursor.connection.commit()
    cursor.connection.close()
    return jsonify({'status': 'login logged'})

@app.route('/api/ingredients', methods=['GET', 'POST'])
def ingredients():
    cursor = get_db_cursor()
    if request.method == 'POST':
        data = request.get_json()
        cursor.execute("INSERT INTO ingredients (name, type, prep_notes, default_unit) VALUES (%s, %s, %s, %s)",
                       (data['name'], data.get('type'), data.get('prep_notes'), data.get('default_unit')))
        cursor.connection.commit()
        cursor.connection.close()
        return jsonify({'status': 'Ingredient added'})
    else:
        cursor.execute("SELECT * FROM ingredients WHERE archived IS NULL OR archived = FALSE")
        ingredients = cursor.fetchall()
        cursor.connection.close()
        return jsonify(ingredients)
@app.route('/api/ingredients/<int:ingredient_id>', methods=['GET'])
def get_ingredient_detail(ingredient_id):
    cursor = get_db_cursor()

    cursor.execute("""
        SELECT * FROM ingredients
        WHERE ingredient_id = %s AND (archived IS NULL OR archived = FALSE)
    """, (ingredient_id,))
    ingredient = cursor.fetchone()

    if not ingredient:
        cursor.connection.close()
        return jsonify({'error': 'Ingredient not found'}), 404

    cursor.execute("""
        SELECT DISTINCT i.item_id, i.name
        FROM recipes r
        JOIN items i ON r.item_id = i.item_id
        WHERE r.source_type = 'ingredient'
        AND r.source_id = %s
        AND (r.archived IS NULL OR r.archived = FALSE)
    """, (ingredient_id,))
    recipes = cursor.fetchall()

    cursor.connection.close()
    return jsonify({
        'ingredient_id': ingredient['ingredient_id'],
        'name': ingredient['name'],
        'recipes': recipes
    })

@app.route('/api/ingredients/<int:ingredient_id>', methods=['PUT'])
def update_ingredient(ingredient_id):
    data = request.get_json()
    cursor = get_db_cursor()

    # Build a flexible SQL update
    cursor.execute("""
        UPDATE ingredients
        SET name = %s,
            category = %s,
            unit = %s,
            notes = %s,
            archived = %s
        WHERE ingredient_id = %s
    """, (
        data.get('name'),
        data.get('category'),
        data.get('unit'),
        data.get('notes'),
        data.get('archived', False),
        ingredient_id
    ))

    cursor.connection.commit()
    cursor.connection.close()

    return jsonify({'status': 'Ingredient updated'})

@app.route('/api/ingredients/merge', methods=['POST'])
def merge_ingredients():
    data = request.get_json()
    ids = data.get('ids')

    if not ids or len(ids) < 2:
        return jsonify({'error': 'Must supply at least two ingredient IDs'}), 400

    ids = sorted(ids)
    keep_id = ids[0]
    drop_ids = ids[1:]

    cursor = get_db_cursor()

    # Reassign all recipes from dropped IDs to the one we're keeping
    cursor.execute("""
        UPDATE recipes
        SET ingredient_id = %s
        WHERE ingredient_id = ANY(%s)
    """, (keep_id, drop_ids))

    # Archive all dropped ingredients
    cursor.execute("""
        UPDATE ingredients
        SET archived = TRUE
        WHERE ingredient_id = ANY(%s)
    """, (drop_ids,))

    cursor.connection.commit()
    cursor.connection.close()

    return jsonify({'status': f'Merged {len(ids)} ingredients into ID {keep_id}'})

@app.route('/api/items', methods=['GET', 'POST'])
def items():
    cursor = get_db_cursor()
    if request.method == 'POST':
        data = request.get_json()
        cursor.execute("""
            INSERT INTO items (name, category, is_prep, is_for_sale, price, description, process_notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            data['name'],
            data.get('category'),
            data.get('is_prep', False),
            data.get('is_for_sale', True),
            data.get('price'),
            data.get('description'),
            data.get('process_notes')
        ))
        cursor.connection.commit()
        cursor.connection.close()
        return jsonify({'status': 'Item added'})
    else:
        cursor.execute("SELECT * FROM items WHERE archived IS NULL OR archived = FALSE")
        items = cursor.fetchall()
        cursor.connection.close()
        return jsonify(items)

@app.route('/api/items/<int:item_id>', methods=['GET'])
def get_item_detail(item_id):
    cursor = get_db_cursor()
    cursor.execute("""
        SELECT * FROM items
        WHERE item_id = %s AND (archived IS NULL OR archived = FALSE)
    """, (item_id,))
    item = cursor.fetchone()
    cursor.connection.close()
    if item:
        return jsonify(item)
    else:
        return jsonify({'error': 'Item not found'}), 404

@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    data = request.get_json()
    cursor = get_db_cursor()

    name = data.get('name', '')
    category = data.get('category')
    is_prep = data.get('is_prep', False)
    is_for_sale = data.get('is_for_sale', True)
    price = parse_float(data.get('price'))
    description = data.get('description', '')
    process_notes = data.get('process_notes', '')
    archived = data.get('archived', data.get('is_archived', False))
    yield_qty = parse_float(data.get('yield_qty'))
    yield_unit = data.get('yield_unit')

    cursor.execute("""
        UPDATE items
        SET name = %s,
            category = %s,
            is_prep = %s,
            is_for_sale = %s,
            price = %s,
            description = %s,
            process_notes = %s,
            archived = %s,
            yield_qty = %s,
            yield_unit = %s
        WHERE item_id = %s
    """, (
        name,
        category,
        is_prep,
        is_for_sale,
        price,
        description,
        process_notes,
        archived,
        yield_qty,
        yield_unit,
        item_id
    ))

    cursor.connection.commit()
    cursor.connection.close()
    return jsonify({'status': 'Item updated'})

@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    cursor = get_db_cursor()
    cursor.execute("UPDATE items SET archived = TRUE WHERE item_id = %s", (item_id,))
    cursor.execute("UPDATE recipes SET archived = TRUE WHERE item_id = %s", (item_id,))
    cursor.execute("""
        UPDATE ingredients
        SET archived = TRUE
        WHERE ingredient_id IN (
            SELECT i.ingredient_id FROM ingredients i
            LEFT JOIN recipes r ON i.ingredient_id = r.ingredient_id AND (r.archived IS NULL OR r.archived = FALSE)
            WHERE r.ingredient_id IS NULL
        )
    """)
    cursor.connection.commit()
    cursor.connection.close()
    return jsonify({'status': 'Item archived and dependencies updated'})

@app.route('/api/items/new', methods=['POST'])
def create_item():
    data = request.get_json()
    cursor = get_db_cursor()

    def parse_float(val):
        try:
            if val == '' or val is None:
                return None
            return float(val)
        except (TypeError, ValueError):
            return None


    # Safely extract fields with fallbacks
    name = data.get('name', '').strip()
    category = data.get('category')
    is_prep = bool(data.get('is_prep', False))
    is_for_sale = bool(data.get('is_for_sale', True))
    price = parse_float(data.get('price'))
    description = data.get('description', '').strip()
    process_notes = data.get('process_notes', '').strip()
    archived = bool(data.get('archived', data.get('is_archived', False)))
    yield_qty = parse_float(data.get('yield_qty'))
    yield_unit = data.get('yield_unit')

    try:
        cursor.execute("""
            INSERT INTO items (
                name, category, is_prep, is_for_sale, price, description,
                process_notes, archived, yield_qty, yield_unit
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING item_id
        """, (
            name, category, is_prep, is_for_sale, price,
            description, process_notes, archived, yield_qty, yield_unit
        ))

        row = cursor.fetchone()
        if not row or 'item_id' not in row:
            cursor.connection.rollback()
            return jsonify({'error': 'Item insert failed or item_id not returned'}), 500

        new_id = row['item_id']
        cursor.connection.commit()
        return jsonify({'status': 'Item created', 'item_id': new_id})

    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500

    finally:
        cursor.connection.close()

@app.route('/api/recipes/<int:item_id>', methods=['GET'])
def get_recipe(item_id):
    cursor = get_db_cursor()
    cursor.execute("""
        SELECT 
            r.recipe_id,
            r.source_type,
            r.source_id,
            r.quantity,
            r.unit,
            r.instructions,
            CASE 
                WHEN r.source_type = 'ingredient' THEN ing.name
                WHEN r.source_type = 'item' THEN it.name
                ELSE 'Unknown'
            END AS source_name
        FROM recipes r
        LEFT JOIN ingredients ing ON r.source_type = 'ingredient' AND r.source_id = ing.ingredient_id
        LEFT JOIN items it ON r.source_type = 'item' AND r.source_id = it.item_id
        WHERE r.item_id = %s AND (r.archived IS NULL OR r.archived = FALSE)
    """, (item_id,))
    rows = cursor.fetchall()
    cursor.connection.close()
    return jsonify(rows)

@app.route('/api/recipes/<int:recipe_id>', methods=['PUT'])
def update_recipe(recipe_id):
    data = request.get_json()
    cursor = get_db_cursor()

    cursor.execute("""
        UPDATE recipes
        SET source_type = %s,
            source_id = %s,
            quantity = %s,
            unit = %s,
            instructions = %s
        WHERE recipe_id = %s
    """, (
        data['source_type'],
        data['source_id'],
        data['quantity'],
        data['unit'],
        data.get('instructions'),
        recipe_id
    ))

    cursor.connection.commit()
    cursor.connection.close()
    return jsonify({'status': 'Recipe updated'})

@app.route('/api/recipes', methods=['POST'])
def add_recipe():
    cursor = get_db_cursor()
    data = request.get_json()

    try:
        item_id = data.get('item_id')
        recipe_rows = data.get('recipe', [])

        if not item_id or not isinstance(recipe_rows, list):
            return jsonify({'error': 'Invalid input format'}), 400

        # Remove existing recipe entries for the item
        cursor.execute("DELETE FROM recipes WHERE item_id = %s", (item_id,))

        # Insert the new recipe rows
        for row in recipe_rows:
            if not all(k in row for k in ['source_type', 'source_id', 'quantity', 'unit']):
                return jsonify({'error': f'Missing required fields in recipe row: {row}'}), 400

            cursor.execute("""
                INSERT INTO recipes (item_id, source_type, source_id, quantity, unit)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                item_id,
                row['source_type'],
                row['source_id'],
                row['quantity'],
                row['unit']
            ))

        cursor.connection.commit()
        return jsonify({'status': 'Recipe saved successfully'})

    except Exception as e:
        cursor.connection.rollback()
        print(f"Error in add_recipe: {e}")
        return jsonify({'error': str(e)}), 500

    finally:
        cursor.close()
        cursor.connection.close()

@app.route('/api/recipes/<int:item_id>', methods=['DELETE'])
def delete_recipes_for_item(item_id):
    cursor = get_db_cursor()
    cursor.execute("DELETE FROM recipes WHERE item_id = %s", (item_id,))
    cursor.connection.commit()
    cursor.connection.close()
    return jsonify({'status': 'deleted'})

@app.route('/api/price_quotes', methods=['POST'])
def create_price_quote():
    data = request.get_json()

    cursor = get_db_cursor()

    try:
        cursor.execute("""
            INSERT INTO price_quotes (
                ingredient_id, source, size_qty, size_unit, price, date_found, notes, is_purchase
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data['ingredient_id'],
            data['source'],
            float(data['size_qty']),
            data['size_unit'],
            float(data['price']),
            data.get('date_found', datetime.today().date()),
            data.get('notes', ''),
            data.get('is_purchase', False)
        ))
        cursor.connection.commit()
        return jsonify({'status': 'Price quote added'}), 201
    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.connection.close()

@app.route('/api/price_quotes', methods=['GET'])
def get_price_quotes():
    ingredient_id = request.args.get('ingredient_id')
    limit = request.args.get('limit', default=1, type=int)  # Default to 1 if not specified

    cursor = get_db_cursor()

    try:
        if ingredient_id:
            cursor.execute("""
                SELECT * FROM price_quotes WHERE ingredient_id = %s
                ORDER BY date_found DESC
                LIMIT %s
            """, (ingredient_id, limit))
        else:
            cursor.execute("""
                SELECT 
                    q.id,
                    q.ingredient_id,
                    i.name AS ingredient_name,
                    q.source,
                    q.size_qty,
                    q.size_unit,
                    q.price,
                    q.date_found,
                    q.notes,
                    q.is_purchase
                FROM price_quotes q
                JOIN ingredients i ON q.ingredient_id = i.ingredient_id
                ORDER BY q.date_found DESC
                LIMIT %s
            """, (limit,))
        quotes = cursor.fetchall()
        return jsonify(quotes)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.connection.close()

@app.route('/api/price_quotes/bulk_insert', methods=['POST'])
def bulk_insert_price_quotes():
    quotes = request.json.get('quotes', [])

    errors = []
    valid_entries = []

    cursor = get_db_cursor()

    # Prepare data for bulk insert
    for quote in quotes:
        ingredient_name = quote.get('ingredient_name')
        cursor.execute("SELECT ingredient_id FROM ingredients WHERE name = %s", (ingredient_name,))
        ingredient = cursor.fetchone()

        if not ingredient:
            errors.append(f"No ingredient found for name: {ingredient_name}")
            continue

        ingredient_id = ingredient['ingredient_id']
        # Validate and prepare entries
        try:
            valid_entry = (
                ingredient_id,
                quote['source'],
                float(quote['qty_amount']),
                quote['qty_unit'],
                float(quote['price']),
                quote.get('date_found', datetime.today().date()),
                quote.get('notes', ''),
                bool(quote.get('is_purchase'))
            )
            valid_entries.append(valid_entry)
        except ValueError as e:
            errors.append(str(e))

    if valid_entries:
        try:
            cursor.executemany("""
                INSERT INTO price_quotes (ingredient_id, source, size_qty, size_unit, price, date_found, notes, is_purchase)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, valid_entries)
            cursor.connection.commit()
        except Exception as e:
            cursor.connection.rollback()
            return jsonify({'error': 'Database insertion failed', 'details': str(e)}), 500

    cursor.connection.close()
    return jsonify({'status': 'Completed with some errors', 'errors': errors}), 200

@app.route('/api/ingredient_cost/<int:ingredient_id>', methods=['GET'])
def get_ingredient_cost(ingredient_id):
    unit = request.args.get('unit')
    qty = float(request.args.get('qty', 1))

    if not unit:
        return jsonify({
            "status": "error",
            "issue": "missing_unit",
            "message": "Missing 'unit' parameter"
        }), 200

    try:
        result = resolve_ingredient_cost(ingredient_id, unit, qty)
        return jsonify(result), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "issue": "internal_exception",
            "message": str(e)
        }), 200

@app.route('/api/item_cost/<int:item_id>', methods=['GET'])
def get_item_cost(item_id):
    unit = request.args.get('unit')
    qty = float(request.args.get('qty', 1))

    if not unit:
        return jsonify({"error": "Missing 'unit' parameter"}), 400

    result = resolve_item_cost(item_id, unit, qty)
    return jsonify(result)

@app.route('/api/ingredient_conversions', methods=['GET'])
def get_ingredient_conversions():
    ingredient_id = request.args.get('ingredient_id')
    cursor = get_db_cursor()

    try:
        if ingredient_id:
                cursor.execute("""
                SELECT * FROM ingredient_conversions
                WHERE ingredient_id = %s OR is_global = TRUE
                ORDER BY is_global ASC, from_unit, to_unit
            """, (ingredient_id,))
        else:
            cursor.execute("""
                SELECT * FROM ingredient_conversions
                ORDER BY ingredient_id NULLS LAST, from_unit, to_unit
            """)
        rows = cursor.fetchall()
        return jsonify(rows)

    finally:
        cursor.connection.close()

@app.route('/api/ingredient_conversions', methods=['POST'])
def add_ingredient_conversion():
    data = request.get_json()
    ingredient_id = data.get('ingredient_id')
    from_unit = data.get('from_unit', '').strip().lower()
    to_unit = data.get('to_unit', '').strip().lower()
    factor = data.get('factor')

    if not all([from_unit, to_unit, factor is not None]):
        return jsonify({"error": "Missing required fields"}), 400

    cursor = get_db_cursor()

    try:
        cursor.execute("""
            INSERT INTO ingredient_conversions (ingredient_id, from_unit, to_unit, factor, is_global)
            VALUES (%s, %s, %s, %s, FALSE)
            RETURNING *
        """, (ingredient_id, from_unit, to_unit, factor))
        new_conversion = cursor.fetchone()
        cursor.connection.commit()
        return jsonify(new_conversion), 201

    finally:
        cursor.connection.close()

@app.route('/api/ingredient_conversions/<int:conversion_id>', methods=['DELETE'])
def delete_ingredient_conversion(conversion_id):
    cursor = get_db_cursor()
    
    try:
        cursor.execute("""
            DELETE FROM ingredient_conversions
            WHERE id = %s
        """, (conversion_id,))
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Conversion not found'}), 404
        
        cursor.connection.commit()
        return jsonify({'status': 'Conversion deleted successfully'}), 200

    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500

    finally:
        cursor.connection.close()

print("=== ROUTES REGISTERED ===")
for rule in app.url_map.iter_rules():
    print(rule)

if __name__ == '__main__':
    app.run(debug=True)
