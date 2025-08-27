from flask import Blueprint, request, jsonify, make_response
from flask_cors import CORS, cross_origin
from .utils.db import get_db_cursor
from .utils.auth_decorator import token_required, roles_required
from datetime import datetime
from functools import wraps

user_bp = Blueprint('user', __name__)

# Let the main app handle CORS configuration

@user_bp.route('/users', methods=['GET'])
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

@user_bp.route('/users', methods=['POST'])
@roles_required('Admin')
def create_user():
    data = request.get_json()
    required_fields = ['email', 'name', 'role']
    
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    # Normalize email to lowercase
    email_lower = (data.get('email') or '').strip().lower()

    cursor = get_db_cursor()
    try:
        # Check if email already exists
        cursor.execute("SELECT email FROM employees WHERE email = %s", (email_lower,))
        if cursor.fetchone():
            return jsonify({'error': 'Email already exists'}), 400

        cursor.execute("""
            INSERT INTO employees (email, name, role, active, created_at)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING employee_id
        """, (
            email_lower,
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

@user_bp.route('/users/<int:user_id>', methods=['PATCH'])
@roles_required('Admin')
def update_user(user_id):
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
            
        # allow name and email changes via API as well
        if 'name' in data:
            update_fields.append("name = %s")
            values.append(data['name'])
        if 'email' in data:
            update_fields.append("email = %s")
            values.append((data['email'] or '').strip().lower())
            
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
