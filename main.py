from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import psycopg2
import psycopg2.extras
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
CORS(app)


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        cursor_factory=psycopg2.extras.RealDictCursor
    )

@app.route('/api/test-db')
def test_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        conn.close()
        return jsonify({'db_test': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

print("Connecting to:", os.getenv("DB_HOST"))

@app.route('/')
def index():
    return "Food Cost Tracker API Running"

@app.route('/api/log-login', methods=['POST'])
def log_login():
    data = request.get_json()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO login_logs (email, name, domain, timestamp)
        VALUES (%s, %s, %s, %s)
    ''', (data.get('email'), data.get('name'), data.get('domain'), data.get('timestamp')))
    conn.commit()
    conn.close()
    return jsonify({'status': 'login logged'})

@app.route('/api/ingredients', methods=['GET', 'POST'])
def ingredients():
    conn = get_db_connection()
    cursor = conn.cursor()
    if request.method == 'POST':
        data = request.get_json()
        cursor.execute("INSERT INTO ingredients (name, type, prep_notes, default_unit) VALUES (%s, %s, %s, %s)",
                       (data['name'], data.get('type'), data.get('prep_notes'), data.get('default_unit')))
        conn.commit()
        conn.close()
        return jsonify({'status': 'Ingredient added'})
    else:
        cursor.execute("SELECT * FROM ingredients WHERE archived IS NULL OR archived = FALSE")
        ingredients = cursor.fetchall()
        conn.close()
        return jsonify(ingredients)
    
@app.route('/api/ingredients/<int:ingredient_id>', methods=['GET'])
def get_ingredient_detail(ingredient_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM ingredients
        WHERE ingredient_id = %s AND (archived IS NULL OR archived = FALSE)
    """, (ingredient_id,))
    ingredient = cursor.fetchone()

    if not ingredient:
        conn.close()
        return jsonify({'error': 'Ingredient not found'}), 404

    cursor.execute("""
        SELECT DISTINCT i.item_id, i.name
        FROM recipes r
        JOIN items i ON r.item_id = i.item_id
        WHERE r.ingredient_id = %s AND (r.archived IS NULL OR r.archived = FALSE)
    """, (ingredient_id,))
    recipes = cursor.fetchall()

    conn.close()
    return jsonify({
        'ingredient_id': ingredient['ingredient_id'],
        'name': ingredient['name'],
        'recipes': recipes
    })

@app.route('/api/ingredients/<int:ingredient_id>', methods=['PUT'])
def update_ingredient(ingredient_id):
    data = request.get_json()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE ingredients
        SET archived = %s
        WHERE ingredient_id = %s
    """, (data.get('archived', False), ingredient_id))
    conn.commit()
    conn.close()
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

    conn = get_db_connection()
    cursor = conn.cursor()

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

    conn.commit()
    conn.close()

    return jsonify({'status': f'Merged {len(ids)} ingredients into ID {keep_id}'})


@app.route('/api/items', methods=['GET', 'POST'])
def items():
    conn = get_db_connection()
    cursor = conn.cursor()
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
        conn.commit()
        conn.close()
        return jsonify({'status': 'Item added'})
    else:
        cursor.execute("SELECT * FROM items WHERE archived IS NULL OR archived = FALSE")
        items = cursor.fetchall()
        conn.close()
        return jsonify(items)

@app.route('/api/items/<int:item_id>', methods=['GET'])
def get_item_detail(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM items
        WHERE item_id = %s AND (archived IS NULL OR archived = FALSE)
    """, (item_id,))
    item = cursor.fetchone()
    conn.close()
    if item:
        return jsonify(item)
    else:
        return jsonify({'error': 'Item not found'}), 404

@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    data = request.get_json()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE items
        SET name = %s, category = %s, is_prep = %s, is_for_sale = %s, price = %s, description = %s, process_notes = %s, archived = %s
        WHERE item_id = %s
    """, (
        data['name'],
        data.get('category'),
        data.get('is_prep', False),
        data.get('is_for_sale', True),
        data.get('price'),
        data.get('description'),
        data.get('process_notes'),
        data.get('is_archived', False),
        item_id
    ))
    conn.commit()
    conn.close()
    return jsonify({'status': 'Item updated'})

@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
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
    conn.commit()
    conn.close()
    return jsonify({'status': 'Item archived and dependencies updated'})

@app.route('/api/recipes/<int:item_id>', methods=['GET'])
def get_recipe(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT r.recipe_id, r.ingredient_id, i.name, r.quantity, r.unit, r.instructions
        FROM recipes r
        JOIN ingredients i ON r.ingredient_id = i.ingredient_id
        WHERE r.item_id = %s AND (r.archived IS NULL OR r.archived = FALSE)
    ''', (item_id,))
    result = cursor.fetchall()
    conn.close()
    return jsonify(result)

@app.route('/api/recipes/<int:recipe_id>', methods=['PUT'])
def update_recipe(recipe_id):
    data = request.get_json()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE recipes
        SET ingredient_id = %s, quantity = %s, unit = %s, instructions = %s
        WHERE recipe_id = %s
    """, (data['ingredient_id'], data['quantity'], data['unit'], data.get('instructions'), recipe_id))
    conn.commit()
    conn.close()
    return jsonify({'status': 'Recipe updated'})

@app.route('/api/recipes', methods=['POST'])
def add_recipe():
    conn = get_db_connection()
    cursor = conn.cursor()
    data = request.get_json()
    cursor.execute("""
        INSERT INTO recipes (item_id, ingredient_id, quantity, unit, instructions)
        VALUES (%s, %s, %s, %s, %s)
    """, (data['item_id'], data['ingredient_id'], data['quantity'], data['unit'], data.get('instructions')))
    conn.commit()
    conn.close()
    return jsonify({'status': 'Recipe added'})

if __name__ == '__main__':
    app.run(debug=True)
