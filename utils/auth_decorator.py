from flask import request, jsonify
from functools import wraps
import jwt
import os
from utils.db import get_db_cursor

# Secret key for JWT - in production, use a secure environment variable
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key-here')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Authentication token is missing'}), 401

        try:
            # Remove 'Bearer ' if present
            if token.startswith('Bearer '):
                token = token[7:]
            
            data = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            
            cursor = get_db_cursor()
            cursor.execute("""
                SELECT e.*, d.name as department_name 
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.department_id
                WHERE e.employee_id = %s AND e.active IS TRUE
            """, (data['employee_id'],))
            employee = cursor.fetchone()
            cursor.close()

            if not employee:
                return jsonify({'error': 'Employee not found or inactive'}), 401

            request.user = employee
            return f(*args, **kwargs)
        
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        except Exception as e:
            print(f"Auth error: {str(e)}")
            return jsonify({'error': 'Invalid authentication'}), 401

    return decorated