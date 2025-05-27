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
        cursor.execute("SELECT * FROM ingredients WHERE archived IS NULL OR archived = 0")
        ingredients = cursor.fetchall()
        conn.close()
        return jsonify(ingredients)

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
            data.get('is_prep', 0),
            data.get('is_for_sale', 1),
            data.get('price'),
            data.get('description'),
            data.get('process_notes')
        ))
        conn.commit()
        conn.close()
        return jsonify({'status': 'Item added'})
    else:
        cursor.execute("SELECT * FROM items WHERE archived IS NULL OR archived = 0")
        items = cursor.fetchall()
        conn.close()
        return jsonify(items)

@app.route('/api/items/<int:item_id>', methods=['GET'])
def get_item_detail(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM items
        WHERE item_id = %s AND (archived IS NULL OR archived = 0)
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
        data.get('is_prep', 0),
        data.get('is_for_sale', 1),
        data.get('price'),
        data.get('description'),
        data.get('process_notes'),
        data.get('is_archived', 0),
        item_id
    ))
    conn.commit()
    conn.close()
    return jsonify({'status': 'Item updated'})

@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE items SET archived = 1 WHERE item_id = %s", (item_id,))
    cursor.execute("UPDATE recipes SET archived = 1 WHERE item_id = %s", (item_id,))
    cursor.execute("""
        UPDATE ingredients
        SET archived = 1
        WHERE ingredient_id IN (
            SELECT i.ingredient_id FROM ingredients i
            LEFT JOIN recipes r ON i.ingredient_id = r.ingredient_id AND (r.archived IS NULL OR r.archived = 0)
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
        WHERE r.item_id = %s AND (r.archived IS NULL OR r.archived = 0)
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
