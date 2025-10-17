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
from .prices_routes import prices_bp
from .conversions_routes import conversions_bp

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
app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(auth_bp, url_prefix='')  # This will handle /auth/check
app.register_blueprint(user_bp, url_prefix='/api')
app.register_blueprint(shift_bp, url_prefix='/api')
app.register_blueprint(departments_bp, url_prefix='/api')
app.register_blueprint(role_permissions_bp, url_prefix='/api')
app.register_blueprint(prices_bp)
app.register_blueprint(conversions_bp, url_prefix='/api')

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

    # Allow callers to request archived ingredients explicitly: ?include_archived=true
    include_archived = request.args.get('include_archived', 'false').lower() in ('1', 'true', 'yes')

    if include_archived:
        cursor.execute("SELECT * FROM ingredients WHERE ingredient_id = %s", (ingredient_id,))
    else:
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
        'recipes': recipes,
        'archived': ingredient.get('archived')
    })

@app.route('/api/ingredients/<int:ingredient_id>', methods=['PUT'])
def update_ingredient(ingredient_id):
    """Perform a safe, partial-friendly update of an ingredient.

    If the client sends only a subset of fields (for example only `archived`),
    we preserve the existing values for fields that are not supplied instead of
    overwriting them with NULL. This avoids accidental data loss when the UI
    sends partial payloads.
    """
    data = request.get_json() or {}
    cursor = get_db_cursor()

    # Log incoming payload for debugging archive/unarchive issues
    try:
        logging.debug("update_ingredient called for id=%s payload=%s", ingredient_id, data)
    except Exception:
        pass

    try:
        # Fetch existing row so we can merge values
        cursor.execute("SELECT * FROM ingredients WHERE ingredient_id = %s", (ingredient_id,))
        existing = cursor.fetchone()
        if not existing:
            cursor.close()
            return jsonify({'error': 'Ingredient not found'}), 404

        # Helper: if key present in payload use it (even if null/false), otherwise keep existing
        def pick(key):
            return data[key] if key in data else existing.get(key)

        name = pick('name')
        category = pick('category')
        unit = pick('unit')
        notes = pick('notes')
        # Support both 'archived' and legacy 'is_archived' keys; if neither present keep existing
        archived_val = data.get('archived', data.get('is_archived', existing.get('archived', False)))

        cursor.execute("""
            UPDATE ingredients
            SET name = %s,
                category = %s,
                unit = %s,
                notes = %s,
                archived = %s
            WHERE ingredient_id = %s
        """, (
            name,
            category,
            unit,
            notes,
            archived_val,
            ingredient_id
        ))

        # Commit the change
        try:
            cursor.connection.commit()
        except Exception:
            try:
                cursor.connection.rollback()
            except Exception:
                pass

        # Fetch updated row to confirm
        try:
            cursor.execute("SELECT ingredient_id, name, archived FROM ingredients WHERE ingredient_id = %s", (ingredient_id,))
            updated = cursor.fetchone()
        except Exception:
            updated = None

        cursor.close()
        if updated:
            return jsonify({'status': 'Ingredient updated', 'ingredient': updated})
        else:
            return jsonify({'status': 'Ingredient updated'})

    except Exception as e:
        logging.exception("Failed to update ingredient %s", ingredient_id)
        try:
            cursor.connection.rollback()
        except Exception:
            pass
        try:
            cursor.close()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 500

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
    cost = parse_float(data.get('cost'))
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
                cost = %s,
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
            cost,
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
            logging.debug("Commit failed or not required for item_id=%s", item_id)

        # Recalculate and persist cost if this is a prep item
        try:
            if is_prep:
                recalc_unit = (yield_unit or '').strip() if yield_unit else None
                recalc_qty = yield_qty or 1
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
    # Allow incoming explicit cost (for non-prep or manual overrides)
    cost = parse_float(data.get('cost'))
    description = data.get('description', '').strip()
    process_notes = data.get('process_notes', '').strip()
    archived = bool(data.get('archived', data.get('is_archived', False)))
    yield_qty = parse_float(data.get('yield_qty'))
    yield_unit = data.get('yield_unit')

    try:
        cursor.execute("""
            INSERT INTO items (
                name, category, is_prep, is_for_sale, price, cost, description,
                process_notes, archived, yield_qty, yield_unit
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING item_id
        """, (
            name, category, is_prep, is_for_sale, price, cost,
            description, process_notes, archived, yield_qty, yield_unit
        ))

        row = cursor.fetchone()
        if not row or 'item_id' not in row:
            cursor.connection.rollback()
            return jsonify({'error': 'Item insert failed or item_id not returned'}), 500

        new_id = row['item_id']
        cursor.connection.commit()
        # If this is a prep item, attempt to compute recipe-based cost and persist it (overrides provided cost)
        try:
            if is_prep and yield_unit:
                calc = resolve_item_cost(new_id, yield_unit, 1)
                if isinstance(calc, dict) and calc.get('status') == 'ok':
                    try:
                        c2 = get_db_cursor()
                        c2.execute("UPDATE items SET cost = %s WHERE item_id = %s", (calc.get('cost_per_unit'), new_id))
                        c2.connection.commit()
                    except Exception:
                        try:
                            c2.connection.rollback()
                        except Exception:
                            pass
                    finally:
                        try:
                            c2.close()
                        except Exception:
                            pass
        except Exception as e:
            print(f"Auto-recalculate failed for created item {new_id}: {e}")
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


@app.route('/api/recipes/<int:item_id>', methods=['DELETE'])
def delete_recipe_rows(item_id):
    """Delete all recipe rows for a given item_id. This mirrors the frontend's
    expectation when it calls DELETE /api/recipes/<item_id> before re-saving
    the full recipe.
    """
    cursor = get_db_cursor()
    try:
        cursor.execute("DELETE FROM recipes WHERE item_id = %s", (item_id,))
        cursor.connection.commit()
        return jsonify({'status': 'Recipes deleted'})
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

@app.route('/api/items/<int:item_id>/recalculate_cost', methods=['POST'])
def recalculate_item_cost(item_id):
    """Recalculate cost for a single item and persist to items.cost if successful.

    This endpoint now allows recalculation for any item. If no explicit unit is
    provided (?unit=...), it will prefer the item's yield_unit, then fall back
    to the first recipe component unit. If no unit can be determined the
    request will fail and ask the caller to provide a unit or set the item's
    yield_unit.
    """
    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT yield_unit, yield_qty, is_prep FROM items WHERE item_id = %s", (item_id,))
        item = cursor.fetchone()
        if not item:
            return jsonify({'error': 'Item not found'}), 404

        # Determine unit to calculate in: query param wins, then item's yield_unit,
        # then first recipe row unit if available.
        unit_param = request.args.get('unit')
        effective_unit = (unit_param or item.get('yield_unit') or '').strip() or None

        if not effective_unit:
            # Try to find a unit used in the item's recipe
            tmpc = get_db_cursor()
            try:
                tmpc.execute("SELECT unit FROM recipes WHERE item_id = %s AND unit IS NOT NULL AND unit <> '' LIMIT 1", (item_id,))
                rr = tmpc.fetchone()
                if rr and rr.get('unit'):
                    effective_unit = rr.get('unit')
            finally:
                try:
                    tmpc.close()
                except Exception:
                    pass

        if not effective_unit:
            return jsonify({'error': 'missing_unit', 'message': 'No yield_unit on item and no unit specified. Provide ?unit=<unit> or set item.yield_unit'}), 400

        result = resolve_item_cost(item_id, effective_unit, 1)
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
            return jsonify({'status': 'ok', 'cost_per_unit': cost_per_unit, 'unit': effective_unit})
        else:
            # Provide a user-friendly message for the UI while keeping technical details
            issue = result.get('issue') if isinstance(result, dict) else None
            user_message = "Computed cost is not available. Please ensure price quotes and unit conversions exist for all components."
            if issue == 'missing_conversion':
                user_message = "Computed cost can't be calculated because a unit conversion is missing for one or more components."
            elif issue == 'missing_price':
                user_message = "Computed cost can't be calculated because a price quote is missing for one or more ingredients."
            elif issue == 'child_resolution_error':
                user_message = "Computed cost can't be calculated due to an error resolving one or more child components. Please check recipe components and conversions."

            return jsonify({
                'status': 'error',
                'issue': issue,
                'message': user_message,
                'computed_cost': None,
                'unit': effective_unit,
                'debug': result
            }), 200

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

            # Safely coerce numeric fields to native floats so JSON contains numbers (not Decimal/strings)
            price = it.get('price')
            cost = it.get('cost')
            try:
                price = float(price) if price is not None else None
            except Exception:
                try:
                    price = float(str(price))
                except Exception:
                    price = None
            try:
                cost = float(cost) if cost is not None else None
            except Exception:
                try:
                    cost = float(str(cost))
                except Exception:
                    cost = None

            # attempt to compute on the fly if prep and cost is missing
            if cost is None:
                if it.get('is_prep') and it.get('yield_unit'):
                    res = resolve_item_cost(item_id, it.get('yield_unit'), 1)
                    if res.get('status') == 'ok':
                        try:
                            cost = float(res.get('cost_per_unit')) if res.get('cost_per_unit') is not None else None
                        except Exception:
                            cost = None

            margin = None
            margin_pct = None
            if price is not None and cost is not None:
                try:
                    margin = float(price) - float(cost)
                    margin_pct = (margin / float(price)) * 100 if float(price) != 0 else None
                except Exception:
                    margin = None
                    margin_pct = None

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


# New endpoint: return missing conversion issues only for a specific ingredient
@app.route('/api/ingredients/<int:ingredient_id>/missing_conversions', methods=['GET'])
def get_ingredient_missing_conversions(ingredient_id):
    """Return missing conversion issues for prep items that reference the given ingredient.

    This is a targeted version of the existing scanner that only checks items that
    include the specified ingredient in their recipe, so it's much cheaper than
    scanning every prep item.
    """
    cursor = get_db_cursor()
    try:
        # Find distinct items that reference this ingredient in recipes
        cursor.execute("""
            SELECT DISTINCT item_id
            FROM recipes
            WHERE source_type = 'ingredient' AND source_id = %s
            AND (archived IS NULL OR archived = FALSE)
        """, (ingredient_id,))
        rows = cursor.fetchall()
        item_ids = [r.get('item_id') for r in rows] if rows else []

        missing = []
        for item_id in item_ids:
            try:
                tmpc = get_db_cursor()
                tmpc.execute("SELECT name, yield_unit FROM items WHERE item_id = %s", (item_id,))
                it = tmpc.fetchone()
                tmpc.close()

                if not it:
                    continue

                unit = it.get('yield_unit') or ''
                res = resolve_item_cost(item_id, unit, 1)
                if isinstance(res, dict) and res.get('status') != 'ok':
                    # walk issues and pick matching missing_conversion entries
                    def walk_issues(obj):
                        if not obj:
                            return []
                        if isinstance(obj, dict):
                            out = []
                            # direct missing_conversion
                            if obj.get('issue') == 'missing_conversion' and obj.get('missing'):
                                # some missing objects include ingredient_id
                                m = obj.get('missing')
                                if m.get('ingredient_id') in (None, ingredient_id, str(ingredient_id), int(ingredient_id)):
                                    out.append(obj)
                            # or child_resolution_error - include for context
                            if obj.get('issue') == 'child_resolution_error':
                                out.append(obj)
                            for v in obj.values():
                                out.extend(walk_issues(v))
                            return out
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
                missing.append({'item_id': item_id, 'error': str(e)})
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

