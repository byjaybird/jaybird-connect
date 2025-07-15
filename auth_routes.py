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
@cross_origin(
    origins=["http://localhost:5173", "https://jaybird-connect.web.app"], 
    methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Access-Control-Allow-Origin"],
    supports_credentials=True,
    expose_headers=["Access-Control-Allow-Origin"],
    allow_origin="*"
)
def verify_auth():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers['Cross-Origin-Opener-Policy'] = 'unsafe-none'
        response.headers['Cross-Origin-Embedder-Policy'] = 'unsafe-none'
        return response

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
        employee = None
        
        try:
            print(f"Attempting to verify user - Email: {email}, Google ID: {google_id}")
            
            cursor.execute("""
                SELECT e.*, d.name as department_name 
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.department_id
                WHERE e.email = %s AND e.active = TRUE
            """, (email,))
            employee = cursor.fetchone()

            if not employee:
                print(f"No active employee found for email: {email}")
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
        finally:
            cursor.close()

        response = jsonify({
            'employee_id': employee['employee_id'],
            'name': employee['name'],
            'email': employee['email'],
            'role': employee['role'],
            'department': employee.get('department_name'),
            'department_id': employee.get('department_id'),
            'isActive': employee['active']
        })
        
        response.headers['Cross-Origin-Opener-Policy'] = 'unsafe-none'
        response.headers['Cross-Origin-Embedder-Policy'] = 'unsafe-none'
        return response

    except Exception as e:
        print(f"Error in verify_auth: {str(e)}")
        return jsonify({'error': 'Internal server error during authentication'}), 500

@auth_bp.route('/api/auth/check', methods=['GET'])
@token_required
@cross_origin(
    origins=["http://localhost:5173", "https://jaybird-connect.web.app"],
    methods=["GET", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Access-Control-Allow-Origin"],
    supports_credentials=True,
    expose_headers=["Access-Control-Allow-Origin"]
)
def check_auth():
    response = jsonify({
        'status': 'valid',
        'user': request.user
    })
    response.headers['Cross-Origin-Opener-Policy'] = 'unsafe-none'
    response.headers['Cross-Origin-Embedder-Policy'] = 'unsafe-none'
    return response