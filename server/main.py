from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import os
import jwt
import psycopg2
import psycopg2.extras
from psycopg2.extras import RealDictCursor
from datetime import datetime
import requests
from .utils.cost_resolver import resolve_ingredient_cost
from .utils.cost_resolver import resolve_item_cost
from .utils.db import get_db_cursor
from .inventory_routes import inventory_bp
from .receiving_routes import receiving_bp
from .tasks_routes import tasks_bp
from .auth_routes import auth_bp
from .user_routes import user_bp
from .shift_routes import shift_routes as shift_bp
from .departments_routes import departments_bp
from .services.shift_api import ShiftAPI
from functools import wraps
from dotenv import load_dotenv
load_dotenv()
import logging
# Configure basic logging to stdout for debugging update failures
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(levelname)s %(message)s')
from .role_permissions import role_permissions_bp

app = Flask(__name__)# Configure CORS with a more precise configuration
CORS(app, 
    resources={
        r"/*": {
            "origins": ["https://jaybird-connect.web.app"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
            "expose_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True,
            "max_age": 3600
        }
    },
    allow_origins=["https://jaybird-connect.web.app"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    expose_headers=["Content-Type", "Authorization"],
    max_age=3600,
    supports_credentials=True
)

# Ensure all responses have proper CORS headers
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin == 'https://jaybird-connect.web.app':
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        if request.method == 'OPTIONS':
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
            response.headers['Access-Control-Max-Age'] = '3600'
            response.status_code = 200
    return response

# Global auth middleware applied before each request (except allowed endpoints)
JWT_SECRET = os.getenv('JWT_SECRET', '49d83126fae6cd7e8f3575e06c89c2ddb34f2bcd34cba4af8cc48009f074f8fd')

@app.before_request
def auth_before_request():
    # Allow OPTIONS and public auth endpoints to bypass auth
    public_paths = {
        '/auth/login', '/api/auth/login',
        '/auth/check', '/api/auth/check',
        '/auth/debug-cors', '/api/auth/debug-cors',
        '/auth/forgot-password', '/api/auth/forgot-password',
        '/auth/reset-password', '/api/auth/reset-password'
    }

    # Allow public GET access to items listing (UI calls /api/items without auth)
    if request.method == 'OPTIONS' or request.path in public_paths or (request.path == '/api/items' and request.method == 'GET'):
        return None

    # Gather possible token sources: Authorization header, X-Auth-Token header, cookie, or query param
    auth_header = request.headers.get('Authorization') or request.headers.get('X-Auth-Token') or request.cookies.get('token') or request.args.get('token')
    if not auth_header:
        return jsonify({'error': 'Authentication token is missing'}), 401

    try:
        cursor = None
        employee = None
        token = None

        # If header uses Bearer, strip it
        if isinstance(auth_header, str) and auth_header.startswith('Bearer '):
            token = auth_header[len('Bearer '):]
        # If header looks like a JWT (three dot-separated parts), treat it as a raw JWT
        elif isinstance(auth_header, str) and auth_header.count('.') == 2:
            token = auth_header
        # If it came from cookie or X-Auth-Token or query param, treat as token string
        elif request.cookies.get('token') or request.headers.get('X-Auth-Token') or request.args.get('token'):
            token = auth_header

        if token:
            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'], options={"verify_exp": True}, leeway=10)
            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'Token has expired'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'error': 'Invalid token'}), 401

            employee_id = payload.get('employee_id')
            if not employee_id:
                return jsonify({'error': 'Invalid token payload'}), 401

            cursor = get_db_cursor()
            cursor.execute("""
                SELECT e.*, d.name as department_name 
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.department_id
                WHERE e.employee_id = %s AND e.active = TRUE
            """, (employee_id,))
            employee = cursor.fetchone()

        else:
            # Legacy clients may send 'user|email' or plain email in the header
            token_or_email = auth_header
            # normalize email to lowercase for lookup
            email = (token_or_email.split('|')[1] if '|' in token_or_email else token_or_email).strip().lower()

            cursor = get_db_cursor()
            cursor.execute("""
                SELECT e.*, d.name as department_name 
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.department_id
                WHERE e.email = %s AND e.active = TRUE
            """, (email,))
            employee = cursor.fetchone()

        if cursor:
            cursor.close()

        if not employee:
            return jsonify({'error': 'Employee not found or inactive'}), 401

        request.user = employee

    except Exception as e:
        print(f"Auth error: {str(e)}")
        return jsonify({'error': 'Invalid authentication'}), 401


# Ensure CORS headers are set correctly (single after_request handler)
@app.after_request
def after_request(response):
    # Only add headers if they don't exist
    if not response.headers.get('Access-Control-Allow-Origin'):
        response.headers['Access-Control-Allow-Origin'] = 'https://jaybird-connect.web.app'

    if not response.headers.get('Access-Control-Allow-Credentials'):
        response.headers['Access-Control-Allow-Credentials'] = 'true'

    if not response.headers.get('Access-Control-Allow-Headers'):
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'

    if not response.headers.get('Access-Control-Allow-Methods'):
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH'

    # Ensure OPTIONS requests return 200 for preflight
    if request.method == 'OPTIONS':
        response.status_code = 200
        response.headers['Access-Control-Max-Age'] = '3600'

    return response

app.register_blueprint(inventory_bp)
app.register_blueprint(receiving_bp)
app.register_blueprint(tasks_bp, url_prefix='/api')
# Register auth blueprint twice to handle both URL patterns
app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(auth_bp, url_prefix='')  # This will handle /auth/check
app.register_blueprint(user_bp, url_prefix='/api')
app.register_blueprint(shift_bp, url_prefix='/api')
app.register_blueprint(departments_bp, url_prefix='/api')
app.register_blueprint(role_permissions_bp, url_prefix='/api')

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
        data.get('is_archived', False),
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
        # parse optional yield fields
        yield_qty = parse_float(data.get('yield_qty'))
        yield_unit = data.get('yield_unit')
        price = parse_float(data.get('price'))
        cursor.execute("""
            INSERT INTO items (name, category, is_prep, is_for_sale, price, description, process_notes, yield_qty, yield_unit)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data['name'],
            data.get('category'),
            data.get('is_prep', False),
            data.get('is_for_sale', True),
            price,
            data.get('description'),
            data.get('process_notes'),
            yield_qty,
            yield_unit
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

    # Safely parse and coerce incoming fields
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

    try:
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

        # If no rows were updated, the item likely doesn't exist
        if hasattr(cursor, 'rowcount') and cursor.rowcount == 0:
            cursor.connection.rollback()
            logging.debug("Update attempted for non-existent item_id=%s", item_id)
            return jsonify({'error': 'Item not found'}), 404

        # Commit and return success
        try:
            cursor.connection.commit()
        except Exception:
            # Some DB cursors are created with autocommit; swallow commit errors but log
            logging.debug("Commit failed or not required for item_id=%s", item_id)

        # Recalculate and persist cost if this is a prep item
        try:
            if is_prep:
                # Use the updated yield_unit if present, fallback to DB
                recalc_unit = (yield_unit or '').strip() if yield_unit else None
                recalc_qty = yield_qty or 1

                # Fetch item yield if not provided in payload
                if not recalc_unit:
                    tmpc = get_db_cursor()
                    tmpc.execute("SELECT yield_unit, yield_qty FROM items WHERE item_id = %s", (item_id,))
                    db_item = tmpc.fetchone()
                    tmpc.close()
                    if db_item:
                        recalc_unit = db_item.get('yield_unit')
                        recalc_qty = db_item.get('yield_qty') or recalc_qty

                if recalc_unit:
                    calc = resolve_item_cost(item_id, recalc_unit, 1)
                    if isinstance(calc, dict) and calc.get('status') == 'ok':
                        new_cost = calc.get('cost_per_unit')
                        c2 = get_db_cursor()
                        try:
                            c2.execute("UPDATE items SET cost = %s WHERE item_id = %s", (new_cost, item_id))
                            c2.connection.commit()
                        except Exception:
                            c2.connection.rollback()
                        finally:
                            try:
                                c2.close()
                            except Exception:
                                pass
        except Exception as e:
            print(f"Failed to recalc cost on item update {item_id}: {e}")

        return jsonify({'status': 'Item updated'})

    except Exception as e:
        # Log full stack trace for debugging
        logging.exception("Failed to update item %s", item_id)
        try:
            cursor.connection.rollback()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 500

    finally:
        try:
            cursor.connection.close()
        except Exception:
            pass

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

        # Validate required fields and collect referenced IDs before making any DB changes
        ingredient_ids = set()
        item_source_ids = set()

        for row in recipe_rows:
            if not all(k in row for k in ['source_type', 'source_id', 'quantity', 'unit']):
                return jsonify({'error': f'Missing required fields in recipe row: {row}'}), 400

            source_type = row['source_type']
            source_id = row['source_id']

            # collect referenced ids for validation
            if source_type == 'ingredient':
                try:
                    ingredient_ids.add(int(source_id))
                except Exception:
                    return jsonify({'error': f'Invalid ingredient id in row: {row}'}), 400
            elif source_type == 'item':
                try:
                    item_source_ids.add(int(source_id))
                except Exception:
                    return jsonify({'error': f'Invalid item id in row: {row}'}), 400

        # Verify referenced ingredients exist
        missing = {'ingredients': [], 'items': []}
        if ingredient_ids:
            cursor.execute("SELECT ingredient_id FROM ingredients WHERE ingredient_id = ANY(%s)", (list(ingredient_ids),))
            found = {r['ingredient_id'] for r in cursor.fetchall()}
            missing_ings = [i for i in ingredient_ids if i not in found]
            if missing_ings:
                return jsonify({'error': 'Missing referenced ingredients', 'missing_ingredients': missing_ings}), 400

        # Verify referenced items exist
        if item_source_ids:
            cursor.execute("SELECT item_id FROM items WHERE item_id = ANY(%s)", (list(item_source_ids),))
            found_items = {r['item_id'] for r in cursor.fetchall()}
            missing_items = [i for i in item_source_ids if i not in found_items]
            if missing_items:
                return jsonify({'error': 'Missing referenced items', 'missing_items': missing_items}), 400

        # All references validated; proceed to replace recipe rows
        cursor.execute("DELETE FROM recipes WHERE item_id = %s", (item_id,))

        for row in recipe_rows:
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

        # Attempt to recalculate and store item cost after saving recipe
        try:
            recalc_cursor = get_db_cursor()
            recalc_cursor.execute("SELECT yield_qty, yield_unit FROM items WHERE item_id = %s", (item_id,))
            item = recalc_cursor.fetchone()
            if item and item.get('yield_unit'):
                recalc_unit = item.get('yield_unit')
                # Calculate cost per single unit of yield_unit
                calc = resolve_item_cost(item_id, recalc_unit, 1)
                if isinstance(calc, dict) and calc.get('status') == 'ok':
                    cost_per_unit = calc.get('cost_per_unit')
                    try:
                        recalc_cursor.execute("UPDATE items SET cost = %s WHERE item_id = %s", (cost_per_unit, item_id))
                        recalc_cursor.connection.commit()
                    except Exception:
                        recalc_cursor.connection.rollback()
            recalc_cursor.close()
        except Exception as e:
            print(f"Auto-recalculate failed for item {item_id}: {e}")

        return jsonify({'status': 'Recipe saved successfully'})

    except Exception as e:
        cursor.connection.rollback()
        print(f"Error in add_recipe: {e}")
        return jsonify({'error': str(e)}), 500

    finally:
        cursor.close()
        cursor.connection.close()

@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    data = request.get_json()
    cursor = get_db_cursor()

    # Safely parse and coerce incoming fields
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

    try:
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

        # If no rows were updated, the item likely doesn't exist
        if hasattr(cursor, 'rowcount') and cursor.rowcount == 0:
            cursor.connection.rollback()
            logging.debug("Update attempted for non-existent item_id=%s", item_id)
            return jsonify({'error': 'Item not found'}), 404

        # Commit and return success
        try:
            cursor.connection.commit()
        except Exception:
            # Some DB cursors are created with autocommit; swallow commit errors but log
            logging.debug("Commit failed or not required for item_id=%s", item_id)

        # Recalculate and persist cost if this is a prep item
        try:
            if is_prep:
                # Use the updated yield_unit if present, fallback to DB
                recalc_unit = (yield_unit or '').strip() if yield_unit else None
                recalc_qty = yield_qty or 1

                # Fetch item yield if not provided in payload
                if not recalc_unit:
                    tmpc = get_db_cursor()
                    tmpc.execute("SELECT yield_unit, yield_qty FROM items WHERE item_id = %s", (item_id,))
                    db_item = tmpc.fetchone()
                    tmpc.close()
                    if db_item:
                        recalc_unit = db_item.get('yield_unit')
                        recalc_qty = db_item.get('yield_qty') or recalc_qty

                if recalc_unit:
                    calc = resolve_item_cost(item_id, recalc_unit, 1)
                    if isinstance(calc, dict) and calc.get('status') == 'ok':
                        new_cost = calc.get('cost_per_unit')
                        c2 = get_db_cursor()
                        try:
                            c2.execute("UPDATE items SET cost = %s WHERE item_id = %s", (new_cost, item_id))
                            c2.connection.commit()
                        except Exception:
                            c2.connection.rollback()
                        finally:
                            try:
                                c2.close()
                            except Exception:
                                pass
        except Exception as e:
            print(f"Failed to recalc cost on item update {item_id}: {e}")

        return jsonify({'status': 'Item updated'})

    except Exception as e:
        # Log full stack trace for debugging
        logging.exception("Failed to update item %s", item_id)
        try:
            cursor.connection.rollback()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 500

    finally:
        try:
            cursor.connection.close()
        except Exception:
            pass

@app.route('/api/items/<int:item_id>/recalculate_cost', methods=['POST'])
def recalculate_item_cost(item_id):
    """Recalculate cost for a single item and persist to items.cost if successful."""
    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT yield_unit, yield_qty, is_prep FROM items WHERE item_id = %s", (item_id,))
        item = cursor.fetchone()
        if not item:
            return jsonify({'error': 'Item not found'}), 404

        if not item.get('is_prep'):
            return jsonify({'status': 'not_prep_item', 'message': 'Non-prep items do not have recipe-based cost'}), 400

        unit = item.get('yield_unit')
        if not unit:
            return jsonify({'error': 'missing_yield_unit', 'message': 'Item missing yield_unit'}), 400

        result = resolve_item_cost(item_id, unit, 1)
        if result.get('status') == 'ok':
            cost_per_unit = result.get('cost_per_unit')
            c = get_db_cursor()
            try:
                c.execute("UPDATE items SET cost = %s WHERE item_id = %s", (cost_per_unit, item_id))
                c.connection.commit()
            finally:
                try:
                    c.close()
                except Exception:
                    pass
            return jsonify({'status': 'ok', 'cost_per_unit': cost_per_unit})
        else:
            return jsonify(result), 200

    finally:
        try:
            cursor.close()
        except Exception:
            pass


@app.route('/api/items/recalculate_all', methods=['POST'])
def recalculate_all_items():
    """Recalculate costs for all prep items. Returns summary of successes and failures."""
    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT item_id, yield_unit FROM items WHERE is_prep = TRUE AND (archived IS NULL OR archived = FALSE)")
        items = cursor.fetchall()
        summary = {'updated': [], 'errors': []}
        for it in items:
            item_id = it.get('item_id')
            unit = it.get('yield_unit')
            if not unit:
                summary['errors'].append({'item_id': item_id, 'issue': 'missing_yield_unit'})
                continue
            try:
                res = resolve_item_cost(item_id, unit, 1)
                if res.get('status') == 'ok':
                    c = get_db_cursor()
                    try:
                        c.execute("UPDATE items SET cost = %s WHERE item_id = %s", (res.get('cost_per_unit'), item_id))
                        c.connection.commit()
                        summary['updated'].append(item_id)
                    finally:
                        try:
                            c.close()
                        except Exception:
                            pass
                else:
                    summary['errors'].append({'item_id': item_id, 'issue': res})
            except Exception as e:
                summary['errors'].append({'item_id': item_id, 'issue': str(e)})
        return jsonify(summary)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@app.route('/api/items/margins', methods=['GET'])
def get_item_margins():
    """Return margin information for items. If item_id supplied, return that item only."""
    item_id = request.args.get('item_id', type=int)
    cursor = get_db_cursor()
    try:
        if item_id:
            cursor.execute("SELECT * FROM items WHERE item_id = %s", (item_id,))
            items = [cursor.fetchone()]
        else:
            cursor.execute("SELECT * FROM items WHERE archived IS NULL OR archived = FALSE")
            items = cursor.fetchall()

        results = []
        for it in items:
            if not it:
                continue
            item_id = it.get('item_id')
            price = it.get('price')
            cost = it.get('cost')
            if cost is None:
                # attempt to compute on the fly if prep
                if it.get('is_prep') and it.get('yield_unit'):
                    res = resolve_item_cost(item_id, it.get('yield_unit'), 1)
                    if res.get('status') == 'ok':
                        cost = res.get('cost_per_unit')
            margin = None
            margin_pct = None
            if price is not None and cost is not None:
                try:
                    margin = float(price) - float(cost)
                    margin_pct = (margin / float(price)) * 100 if float(price) != 0 else None
                except Exception:
                    pass
            results.append({
                'item_id': item_id,
                'name': it.get('name'),
                'price': price,
                'cost': cost,
                'margin': margin,
                'margin_pct': round(margin_pct, 2) if margin_pct is not None else None
            })
        return jsonify(results)
    finally:
        try:
            cursor.close()
        except Exception:
            pass


@app.route('/api/recipes/missing_conversions', methods=['GET'])
def get_missing_recipe_conversions():
    """Scan prep items and report missing conversions encountered during cost resolution."""
    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT item_id, name, yield_unit FROM items WHERE is_prep = TRUE AND (archived IS NULL OR archived = FALSE)")
        items = cursor.fetchall()
        missing = []
        for it in items:
            item_id = it.get('item_id')
            unit = it.get('yield_unit') or ''
            try:
                res = resolve_item_cost(item_id, unit, 1)
                if isinstance(res, dict) and res.get('status') != 'ok':
                    # collect missing_conversion issues specifically and nested issues
                    def walk_issues(obj):
                        if not obj:
                            return []
                        if isinstance(obj, dict):
                            if obj.get('issue') == 'missing_conversion' or obj.get('issue') == 'child_resolution_error':
                                return [obj]
                            # nested details
                            items = []
                            for v in obj.values():
                                items.extend(walk_issues(v))
                            return items
                        if isinstance(obj, list):
                            out = []
                            for v in obj:
                                out.extend(walk_issues(v))
                            return out
                        return []

                    issues = walk_issues(res)
                    if issues:
                        missing.append({'item_id': item_id, 'name': it.get('name'), 'issues': issues})
            except Exception as e:
                missing.append({'item_id': item_id, 'name': it.get('name'), 'error': str(e)})
        return jsonify(missing)
    finally:
        try:
            cursor.close()
        except Exception:
            pass

print("=== ROUTES REGISTERED ===")
for rule in app.url_map.iter_rules():
    print(rule)

if __name__ == '__main__':
    app.run(debug=True)

