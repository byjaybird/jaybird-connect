# utils/db.py

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
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
