"""API routes for department management."""
from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor

departments_bp = Blueprint('departments', __name__)

@departments_bp.route('/api/departments', methods=['GET'])
def get_departments():
    """Get all departments."""
    cursor = get_db_cursor()
    
    try:
        cursor.execute("""
            SELECT department_id, name, description, created_at
            FROM departments
            WHERE (archived IS NULL OR archived = FALSE)
            ORDER BY name
        """)
        departments = cursor.fetchall()
        return jsonify(departments)
    except Exception as e:
        print("Error in get_departments:", str(e))
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()