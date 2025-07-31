from flask import request, jsonify
from functools import wraps
import jwt
import os
from utils.db import get_db_cursor

# Secret key for JWT
JWT_SECRET = os.getenv('JWT_SECRET', '49d83126fae6cd7e8f3575e06c89c2ddb34f2bcd34cba4af8cc48009f074f8fd')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Allow OPTIONS requests to pass through
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)
            
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Authentication token is missing'}), 401

        try:
            # Remove 'Bearer ' if present
            if token.startswith('Bearer '):
                token = token[7:]
            
            # Decode with explicit leeway to handle minor clock skew
            data = jwt.decode(
                token, 
                JWT_SECRET, 
                algorithms=['HS256'],
                options={"verify_exp": True},
                leeway=10  # 10 seconds of leeway for clock skew
            )
            
            cursor = get_db_cursor()
            try:
                cursor.execute("""
                    SELECT e.*, d.name as department_name 
                    FROM employees e
                    LEFT JOIN departments d ON e.department_id = d.department_id
                    WHERE e.employee_id = %s AND e.active IS TRUE
                """, (data['employee_id'],))
                employee = cursor.fetchone()
                
                if not employee:
                    return jsonify({'error': 'Employee not found or inactive'}), 401

                request.user = employee
            finally:
                cursor.close()

        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        except Exception as e:
            print(f"Auth error: {str(e)}")
            return jsonify({'error': 'Invalid authentication'}), 401

        # Call the actual route function outside the auth try-catch block
        try:
            return f(*args, **kwargs)
        except Exception as e:
            print(f"Route error: {str(e)}")
            return jsonify({'error': str(e)}), 500

    return decorated