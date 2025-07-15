from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor
from functools import wraps
from flask_cors import cross_origin

auth_bp = Blueprint('auth', __name__)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
                return jsonify({'error': 'Authentication token is missing'}), 401

        try:
            google_id = auth_header.split('|')[0] if '|' in auth_header else auth_header
            cursor = get_db_cursor()
            cursor.execute("""
                SELECT e.*, d.name as department_name 
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.department_id
                WHERE (e.google_sub = %s OR e.email = %s) AND e.active = TRUE
            """, (google_id, google_id))
            employee = cursor.fetchone()
            cursor.close()

            if not employee:
                return jsonify({'error': 'Employee not found or inactive'}), 401

            request.user = employee
            return f(*args, **kwargs)
        
        except Exception as e:
            print(f"Auth error: {str(e)}")
            return jsonify({'error': 'Invalid authentication'}), 401

    return decorated

@auth_bp.route('/api/auth/verify', methods=['POST', 'OPTIONS'])
@cross_origin(origins=["http://localhost:5173", "https://jaybird-connect.web.app"], 
             methods=["POST", "OPTIONS"],
             allow_headers=["Content-Type", "Authorization"],
             supports_credentials=True)
def verify_auth():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})

    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data received'}), 400

        email = data.get('email')
        name = data.get('name')
        google_id = data.get('googleId')

        if not email or not name:
            return jsonify({'error': 'Missing required fields'}), 400

        cursor = get_db_cursor()
        try:
            cursor.execute("""
                SELECT e.*, d.name as department_name 
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.department_id
                WHERE e.email = %s AND LOWER(e.active::text) = 'true'
            """, (email,))
            employee = cursor.fetchone()

            if not employee:
                return jsonify({
                    'error': 'User not authorized. Please contact your administrator to request access.'
                }), 403

            cursor.execute("""
                UPDATE employees
                SET last_login = CURRENT_TIMESTAMP,
                    google_sub = %s
                WHERE employee_id = %s
                RETURNING *
            """, (google_id, employee['employee_id']))

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

    except Exception as e:
        print(f"Error in verify_auth: {str(e)}")
        return jsonify({'error': 'Internal server error during authentication'}), 500

@auth_bp.route('/api/auth/check', methods=['GET'])
@token_required
def check_auth():
    return jsonify({
        'status': 'valid',
        'user': request.user
    })
