import os
import psycopg2
import psycopg2.extras

def get_db_connection():
    conn = psycopg2.connect(
        dbname=os.environ.get("DB_NAME"),
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASSWORD"),
        host=os.environ.get("DB_HOST")
    )
    conn.autocommit = True
    return conn

def get_db_cursor():
    try:
        conn = get_db_connection()
        return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    except Exception as e:
        print(f"Database connection error: {str(e)}")
        raise
