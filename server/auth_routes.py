from flask import Blueprint, request, jsonify, make_response
from flask_cors import CORS
from .utils.db import get_db_cursor
from functools import wraps
import jwt
import bcrypt
import os
from datetime import datetime, timedelta
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from .utils.auth_decorator import token_required

auth_bp = Blueprint('auth', __name__)

# Let the main app handle CORS configuration

# Secret key for JWT - in production, use a secure environment variable
JWT_SECRET = os.getenv('JWT_SECRET')
SMTP_SERVER = os.getenv('SMTP_SERVER')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SMTP_USERNAME = os.getenv('SMTP_USERNAME')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')
SMTP_FROM_EMAIL = os.getenv('SMTP_FROM_EMAIL')



@auth_bp.route('/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data received'}), 400

        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': 'Missing email or password'}), 400

        cursor = get_db_cursor()
        try:
            cursor.execute("""
                SELECT e.*, d.name as department_name 
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.department_id
                WHERE e.email = %s
            """, (email,))
            employee = cursor.fetchone()

            if not employee:
                return jsonify({'message': 'User not found'}), 401

            if not employee['active']:
                return jsonify({'message': 'User not active'}), 403

            if not bcrypt.checkpw(password.encode('utf-8'), employee['password_hash'].encode('utf-8')):
                return jsonify({'message': 'Incorrect password'}), 401# Generate JWT token with ample expiration and issued at time
            now = datetime.utcnow()
            token = jwt.encode({
                'employee_id': employee['employee_id'],
                'email': employee['email'],
                'exp': now + timedelta(days=7),  # Token expires in 7 days
                'iat': now  # Issued at time
            }, JWT_SECRET, algorithm='HS256')# Update last login
            cursor.execute("""
                UPDATE employees
                SET last_login = CURRENT_TIMESTAMP
                WHERE employee_id = %s
            """, (employee['employee_id'],))
            
            # Log the login
            cursor.execute('''
                INSERT INTO login_logs (email, name, domain, timestamp)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            ''', (employee['email'], employee['name'], employee.get('department_name')))
            
            cursor.connection.commit()

            return jsonify({
                'token': token,
                'employee': {
                    'employee_id': employee['employee_id'],
                    'name': employee['name'],
                    'email': employee['email'],
                    'role': employee['role'],
                    'department': employee.get('department_name'),
                    'department_id': employee.get('department_id'),
                    'isActive': employee['active']
                }
            })
        finally:
            cursor.close()

    except Exception as e:
        print(f"Error in login: {str(e)}")
        return jsonify({'error': 'Internal server error during authentication'}), 500

@auth_bp.route('/auth/register', methods=['POST'])
@token_required  # Only authenticated admins can register new users
def register():
    if request.user['role'] != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403

    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data received'}), 400

        required_fields = ['email', 'password', 'name', 'role', 'department_id']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400

        # Hash the password
        password_hash = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt())

        cursor = get_db_cursor()
        try:
            # Check if email already exists
            cursor.execute("SELECT email FROM employees WHERE email = %s", (data['email'],))
            if cursor.fetchone():
                return jsonify({'error': 'Email already registered'}), 400

            cursor.execute("""
                INSERT INTO employees (
                    email, password_hash, name, role, department_id, active
                ) VALUES (%s, %s, %s, %s, %s, TRUE)
                RETURNING employee_id
            """, (
                data['email'],
                password_hash.decode('utf-8'),
                data['name'],
                data['role'],
                data['department_id']
            ))
            
            new_employee_id = cursor.fetchone()['employee_id']
            cursor.connection.commit()

            return jsonify({
                'status': 'success',
                'message': 'Employee registered successfully',
                'employee_id': new_employee_id
            }), 201

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error in register: {str(e)}")
        return jsonify({'error': 'Internal server error during registration'}), 500

@auth_bp.route('/auth/change-password', methods=['POST'])
@token_required
def change_password():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data received'}), 400

        current_password = data.get('currentPassword')
        new_password = data.get('newPassword')

        if not current_password or not new_password:
            return jsonify({'error': 'Missing current or new password'}), 400

        cursor = get_db_cursor()
        try:
            cursor.execute("SELECT password_hash FROM employees WHERE employee_id = %s", 
                         (request.user['employee_id'],))
            employee = cursor.fetchone()

            # Verify current password
            if not bcrypt.checkpw(current_password.encode('utf-8'), 
                                employee['password_hash'].encode('utf-8')):
                return jsonify({'error': 'Current password is incorrect'}), 401

            # Hash and update new password
            new_password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
            cursor.execute("""
                UPDATE employees 
                SET password_hash = %s 
                WHERE employee_id = %s
            """, (new_password_hash.decode('utf-8'), request.user['employee_id']))
            
            cursor.connection.commit()
            return jsonify({'status': 'Password updated successfully'})

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error in change_password: {str(e)}")
        return jsonify({'error': 'Internal server error during password change'}), 500
    
@auth_bp.route('/auth/check', methods=['GET', 'POST', 'OPTIONS'])
def check_auth():
    if request.method == 'OPTIONS':
        response = make_response()
        response.status_code = 200
        # Ensure CORS headers are set for OPTIONS
        response.headers.update({
            'Access-Control-Allow-Origin': 'https://jaybird-connect.web.app',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '3600'
        })
        return response
        
    # For GET and POST requests, require token
    if request.method in ['GET', 'POST']:
        # Wrap the token_required logic here
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication token is missing'}), 401

        try:
            # Strip 'Bearer ' from the token if present
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else auth_header
            
            # Decode and verify the token
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            
            # Get user details
            cursor = get_db_cursor()
            try:
                cursor.execute("""
                    SELECT e.*, d.name as department_name 
                    FROM employees e
                    LEFT JOIN departments d ON e.department_id = d.department_id
                    WHERE e.employee_id = %s AND e.active = TRUE
                """, (payload['employee_id'],))
                user = cursor.fetchone()
                
                if not user:
                    return jsonify({'error': 'User not found or inactive'}), 401

                return jsonify({
                    'status': 'valid',
                    'user': {
                        'employee_id': user['employee_id'],
                        'name': user['name'],
                        'email': user['email'],
                        'role': user['role'],
                        'department': user.get('department_name'),
                        'department_id': user.get('department_id'),
                        'isActive': user['active']
                    }
                })
            finally:
                cursor.close()
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        except Exception as e:
            print(f"Error in check_auth: {str(e)}")
            return jsonify({'error': 'Internal server error during auth check'}), 500
    try:
        return jsonify({
            'status': 'valid',
            'user': {
                'employee_id': request.user['employee_id'],
                'name': request.user['name'],
                'email': request.user['email'],
                'role': request.user['role'],
                'department': request.user.get('department_name'),
                'department_id': request.user.get('department_id'),
                'isActive': request.user['active']
            }
        })
    except Exception as e:
        print(f"Error in check_auth: {str(e)}")
        return jsonify({'error': 'Internal server error during auth check'}), 500

def send_reset_email(email, reset_token):
    try:
        reset_link = f"{request.host_url}reset-password?token={reset_token}"
        
        msg = MIMEMultipart()
        msg['From'] = SMTP_FROM_EMAIL
        msg['To'] = email
        msg['Subject'] = "Password Reset Request"
        
        body = f"""
        You have requested to reset your password.
        
        Please click the following link to reset your password:
        {reset_link}
        
        This link will expire in 1 hour.
        
        If you did not request this password reset, please ignore this email.
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
        
        return True
    except Exception as e:
        print(f"Error sending email: {str(e)}")
        return False

@auth_bp.route('/auth/forgot-password', methods=['POST'])
def forgot_password():
    try:
        data = request.get_json()
        if not data or 'email' not in data:
            return jsonify({'error': 'Email is required'}), 400

        email = data['email']
        cursor = get_db_cursor()
        
        try:
            # Check if user exists
            cursor.execute("SELECT employee_id FROM employees WHERE email = %s AND active = TRUE", (email,))
            employee = cursor.fetchone()
            
            if not employee:
                # Return success even if email not found to prevent email enumeration
                return jsonify({'message': 'If an account exists with this email, you will receive password reset instructions'}), 200
            
            # Generate reset token
            reset_token = secrets.token_urlsafe(32)
            reset_token_expiry = datetime.utcnow() + timedelta(hours=1)
            
            # Store reset token in database
            cursor.execute("""
                UPDATE employees 
                SET reset_token = %s, reset_token_expires = %s 
                WHERE employee_id = %s
            """, (reset_token, reset_token_expiry, employee['employee_id']))
            
            cursor.connection.commit()
            
            # Send reset email
            if send_reset_email(email, reset_token):
                return jsonify({'message': 'If an account exists with this email, you will receive password reset instructions'}), 200
            else:
                return jsonify({'error': 'Failed to send reset email'}), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error in forgot_password: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@auth_bp.route('/auth/reset-password', methods=['POST'])
def reset_password():
    try:
        data = request.get_json()
        if not data or 'token' not in data or 'password' not in data:
            return jsonify({'error': 'Token and new password are required'}), 400

        
        cursor = get_db_cursor()
        try:
            # Find user with valid reset token
            cursor.execute("""
                SELECT employee_id 
                FROM employees 
                WHERE reset_token = %s 
                AND reset_token_expires > CURRENT_TIMESTAMP 
                AND active = TRUE
            """, (token,))
            
            employee = cursor.fetchone()
            
            if not employee:
                return jsonify({'error': 'Invalid or expired reset token'}), 400
            
            # Hash and update new password
            password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
            
            # Update password and clear reset token
            cursor.execute("""
                UPDATE employees 
                SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL 
                WHERE employee_id = %s
            """, (password_hash.decode('utf-8'), employee['employee_id']))
            
            cursor.connection.commit()
            return jsonify({'message': 'Password has been reset successfully'}), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error in reset_password: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
    

@auth_bp.route('/auth/debug-cors', methods=['OPTIONS', 'GET'])
def debug_cors():
    """Debug endpoint to check CORS configuration"""
    if request.method == 'OPTIONS':
        response = make_response()
        response.status_code = 200
    else:
        response = jsonify({
            'method': request.method,
            'headers': dict(request.headers),
            'origin': request.headers.get('Origin'),
            'cors_enabled': 'yes'
        })
    
    # Explicitly set CORS headers
    response.headers.update({
        'Access-Control-Allow-Origin': 'https://jaybird-connect.web.app',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '3600'
    })
    return response
