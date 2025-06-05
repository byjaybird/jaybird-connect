import os
import psycopg2
import psycopg2.extras

def get_db_connection():
    conn = psycopg2.connect(
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        host=os.environ["DB_HOST"]
    )
    conn.autocommit = True
    return conn

def get_db_cursor():
    conn = get_db_connection()
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
def resolve_ingredient_cost(ingredient_id, recipe_unit, quantity=1):
    cursor = get_db_cursor()
    try:
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

        quote_unit = quote['unit'].lower() if quote['unit'] else ""
        total_qty = quote['quantity']
    finally:
        cursor.close()

