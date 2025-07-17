from flask import Blueprint, request, jsonify, make_response
from flask_cors import cross_origin
from utils.db import get_db_cursor
from auth_routes import token_required
from datetime import datetime
from functools import wraps

user_bp = Blueprint('user', __name__)

# CORS configuration
CORS_CONFIG = {
    "origins": ["http://localhost:5173", "https://jaybird-connect.web.app", "https://jaybird-connect.ue.r.appspot.com"],
    "allow_headers": [
        "Content-Type",
        "Authorization",
        "User-Agent",
        "Accept",
        "Origin",
        "Referer",
        "Sec-Fetch-Mode",
        "Sec-Fetch-Site",
        "Sec-Fetch-Dest",
        "sec-ch-ua",
        "sec-ch-ua-mobile",
        "sec-ch-ua-platform"
    ],
    "supports_credentials": True,
    "max_age": 600
}

# Add OPTIONS request handling
@user_bp.route('/api/users', methods=['OPTIONS'])
@cross_origin(**CORS_CONFIG, methods=["GET", "POST", "PATCH", "OPTIONS"])
def handle_users_options():
    response = make_response()
    return response

@user_bp.route('/api/users/<int:user_id>', methods=['OPTIONS'])
@cross_origin(**CORS_CONFIG, methods=["GET", "PATCH", "OPTIONS"])
def handle_user_options(user_id):
    response = make_response()
    return response

@user_bp.route('/api/users', methods=['GET'])
@cross_origin(**CORS_CONFIG)
@token_required
def get_users():
    cursor = get_db_cursor()
    try:
        cursor.execute("""
            SELECT 
                e.employee_id,
                e.email,
                e.name,
                e.role,
                e.active,
                e.created_at,
                e.last_login,
                d.name as department_name
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.department_id
            ORDER BY e.created_at DESC
        """)
        users = cursor.fetchall()
        # Convert datetime objects to strings to make them JSON serializable
        for user in users:
            if user['created_at']:
                user['created_at'] = user['created_at'].isoformat()
            if user['last_login']:
                user['last_login'] = user['last_login'].isoformat()
        return jsonify(users)
    finally:
        cursor.close()

@user_bp.route('/api/users', methods=['POST'])
@cross_origin(**CORS_CONFIG)
@token_required
def create_user():
    if request.user['role'] != 'Admin':
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    required_fields = ['email', 'name', 'role']
    
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    cursor = get_db_cursor()
    try:
        # Check if email already exists
        cursor.execute("SELECT email FROM employees WHERE email = %s", (data['email'],))
        if cursor.fetchone():
            return jsonify({'error': 'Email already exists'}), 400

        cursor.execute("""
            INSERT INTO employees (email, name, role, active, created_at)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING employee_id
        """, (
            data['email'],
            data['name'],
            data['role'],
            data.get('active', True)
        ))
        new_user_id = cursor.fetchone()['employee_id']
        cursor.connection.commit()
        
        return jsonify({'message': 'User created successfully', 'employee_id': new_user_id}), 201
    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

@user_bp.route('/api/users/<int:user_id>', methods=['PATCH'])
@cross_origin(**CORS_CONFIG)
@token_required
def update_user(user_id):
    if request.user['role'] != 'Admin':
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    cursor = get_db_cursor()
    
    try:
        update_fields = []
        values = []
        
        if 'active' in data:
            update_fields.append("active = %s")
            values.append(data['active'])
        
        if 'role' in data:
            update_fields.append("role = %s")
            values.append(data['role'])
            
        if not update_fields:
            return jsonify({'error': 'No fields to update'}), 400
            
        values.append(user_id)
        
        query = f"""
            UPDATE employees 
            SET {', '.join(update_fields)}
            WHERE employee_id = %s
            RETURNING employee_id
        """
        
        cursor.execute(query, values)
        cursor.connection.commit()
        
        return jsonify({'message': 'User updated successfully'})
    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
@cross_origin(
    origins=["http://localhost:5173", "https://jaybird-connect.web.app", "https://jaybird-connect.ue.r.appspot.com"],
    supports_credentials=True
)
@token_required
def get_users():
    cursor = get_db_cursor()
    try:
        cursor.execute("""
            SELECT 
                e.employee_id,
                e.email,
                e.name,
                e.role,
                e.active,
                e.created_at,
                e.last_login,
                d.name as department_name
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.department_id
            ORDER BY e.created_at DESC
        """)
        users = cursor.fetchall()
        # Convert datetime objects to strings to make them JSON serializable
        for user in users:
            if user['created_at']:
                user['created_at'] = user['created_at'].isoformat()
            if user['last_login']:
                user['last_login'] = user['last_login'].isoformat()
        return jsonify(users)
    finally:
        cursor.close()

@user_bp.route('/api/users', methods=['POST'])
@cross_origin(
    origins=["http://localhost:5173", "https://jaybird-connect.web.app", "https://jaybird-connect.ue.r.appspot.com"],
    supports_credentials=True
)
@token_required
def create_user():
    if request.user['role'] != 'Admin':
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    required_fields = ['email', 'name', 'role']
    
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    cursor = get_db_cursor()
    try:
        # Check if email already exists
        cursor.execute("SELECT email FROM employees WHERE email = %s", (data['email'],))
        if cursor.fetchone():
            return jsonify({'error': 'Email already exists'}), 400

        cursor.execute("""
            INSERT INTO employees (email, name, role, active, created_at)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING employee_id
        """, (
            data['email'],
            data['name'],
            data['role'],
            data.get('active', True)
        ))
        new_user_id = cursor.fetchone()['employee_id']
        cursor.connection.commit()
        
        return jsonify({'message': 'User created successfully', 'employee_id': new_user_id}), 201
    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

@user_bp.route('/api/users/<int:user_id>', methods=['PATCH'])
@cross_origin(
    origins=["http://localhost:5173", "https://jaybird-connect.web.app", "https://jaybird-connect.ue.r.appspot.com"],
    supports_credentials=True
)
@token_required
def update_user(user_id):
    if request.user['role'] != 'Admin':
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    cursor = get_db_cursor()
    
    try:
        update_fields = []
        values = []
        
        if 'active' in data:
            update_fields.append("active = %s")
            values.append(data['active'])
        
        if 'role' in data:
            update_fields.append("role = %s")
            values.append(data['role'])
            
        if not update_fields:
            return jsonify({'error': 'No fields to update'}), 400
            
        values.append(user_id)
        
        query = f"""
            UPDATE employees 
            SET {', '.join(update_fields)}
            WHERE employee_id = %s
            RETURNING employee_id
        """
        
        cursor.execute(query, values)
        cursor.connection.commit()
        
        return jsonify({'message': 'User updated successfully'})
    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()