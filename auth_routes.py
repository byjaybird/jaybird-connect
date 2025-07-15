from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor
from functools import wraps
from datetime import datetime
from flask_cors import cross_origin

auth_bp = Blueprint('auth', __name__)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication token is missing'}), 401

        try:
            email = auth_header.split('|')[1] if '|' in auth_header else auth_header
            cursor = get_db_cursor()
            cursor.execute("""
                SELECT e.*, d.name as department_name 
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.department_id
                WHERE e.email = %s AND e.active = TRUE
            """, (email,))
            employee = cursor.fetchone()
            cursor.close()

            if not employee:
                return jsonify({'error': 'Employee not found or inactive'}), 401

            request.user = employee
            return f(*args, **kwargs)
        
        except Exception as e:
            return jsonify({'error': 'Invalid authentication'}), 401

    return decorated

@auth_bp.route('/api/auth/verify', methods=['POST', 'OPTIONS'])
@cross_origin(origins=["http://localhost:5173", "https://jaybird-connect.web.app"], 
             methods=["POST", "OPTIONS"],
             allow_headers=["Content-Type", "Authorization"],
             supports_credentials=True)
def verify_auth():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        return response

    data = request.get_json()
    email = data.get('email')
    name = data.get('name')
    google_id = data.get('googleId')  # This might be None initially

    if not email or not name:  # Only require email and name
        return jsonify({'error': 'Missing required fields (email and name)'}), 400

    cursor = get_db_cursor()
    try:
        cursor.execute("""
            SELECT e.*, d.name as department_name 
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.department_id
            WHERE e.email = %s AND e.active = TRUE
        """, (email,))
        employee = cursor.fetchone()

        if not employee:
            return jsonify({
                'error': 'User not authorized. Please contact your administrator to request access.'
            }), 403

        # Update google_sub only if provided
        if google_id:
            cursor.execute("""
                UPDATE employees
                SET last_login = CURRENT_TIMESTAMP,
                    google_sub = %s
                WHERE employee_id = %s
                RETURNING *
            """, (google_id, employee['employee_id']))
        else:
            cursor.execute("""
                UPDATE employees
                SET last_login = CURRENT_TIMESTAMP
                WHERE employee_id = %s
                RETURNING *
            """, (employee['employee_id'],))

        cursor.connection.commit()

        return jsonify({
            'employee_id': employee['employee_id'],
            'name': employee['name'],
            'email': employee['email'],
            'role': employee['role'],
            'department': employee.get('department_name'),
            'department_id': employee.get('department_id'),
            'isActive': employee['active']
        })
    finally:
        cursor.close()