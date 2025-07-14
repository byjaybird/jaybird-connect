from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor
from functools import wraps
from google.oauth2 import id_token
from google.auth.transport import requests
import os
from datetime import datetime

tasks_bp = Blueprint('tasks', __name__)

def verify_google_token(token):
    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            requests.Request(),
            os.getenv('GOOGLE_CLIENT_ID')
        )
        return {
            'sub': idinfo['sub'],
            'email': idinfo['email'],
            'name': idinfo['name']
        }
    except ValueError:
        return None

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Authentication token is missing'}), 401
        if token.startswith('Bearer '):
            token = token[7:]
        user_data = verify_google_token(token)
        if not user_data:
            return jsonify({'error': 'Invalid or expired token'}), 401
        request.user = user_data
        return f(*args, **kwargs)
    return decorated

@tasks_bp.route('/api/auth/verify', methods=['POST'])
def verify_auth():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({'error': 'Authentication token is missing'}), 401
    if token.startswith('Bearer '):
        token = token[7:]
    user_data = verify_google_token(token)
    if not user_data:
        return jsonify({'error': 'Invalid or expired token'}), 401
    cursor = get_db_cursor()
    try:
        cursor.execute("""
            SELECT e.*, d.name as department_name 
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.department_id
            WHERE e.google_sub = %s AND e.active = TRUE
        """, (user_data['sub'],))
        employee = cursor.fetchone()
        if not employee:
            cursor.execute("""
                INSERT INTO employees (email, name, google_sub, role, active)
                VALUES (%s, %s, %s, 'Employee', TRUE)
                RETURNING *
            """, (user_data['email'], user_data['name'], user_data['sub']))
        employee = cursor.fetchone()
        cursor.connection.commit()
        cursor.execute("""
            UPDATE employees
            SET last_login = NOW()
            WHERE employee_id = %s
        """, (employee['employee_id'],))
        cursor.connection.commit()
        return jsonify({
            'employee_id': employee['employee_id'],
            'name': employee['name'],
            'email': employee['email'],
            'role': employee['role'],
            'department': employee.get('department_name'),
            'department_id': employee.get('department_id')
        })
    finally:
        cursor.close()

@tasks_bp.route('/api/tasks/assigned/<int:user_id>', methods=['GET'])
@token_required
def get_assigned_tasks(user_id):
    cursor = get_db_cursor()
    try:
        cursor.execute("""
            SELECT
                t.*,
                e.name as assigned_by_name,
                d.name as department_name
            FROM tasks t
            LEFT JOIN employees e ON t.assigned_by = e.employee_id
            LEFT JOIN departments d ON t.department_id = d.department_id
            WHERE t.assigned_to = %s
            ORDER BY t.due_date ASC
        """, (user_id,))
        tasks = cursor.fetchall()

        return jsonify(tasks)
    finally:
        cursor.close()

@tasks_bp.route('/api/tasks/<int:task_id>', methods=['PUT'])
@token_required
def update_task_status(task_id):
    data = request.get_json()
    status = data.get('status')
    notes = data.get('notes')

    if not status:
        return jsonify({'error': 'Status is required'}), 400

    cursor = get_db_cursor()
    try:
        cursor.execute("""
            SELECT * FROM tasks
            WHERE task_id = %s AND assigned_to = %s
        """, (task_id, request.user['employee_id']))
        task = cursor.fetchone()

        if not task:
            return jsonify({'error': 'Task not found or access denied'}), 404

        cursor.execute("""
            UPDATE tasks
            SET status = %s,
                notes = COALESCE(%s, notes),
                updated_at = NOW()
            WHERE task_id = %s
            RETURNING *
        """, (status, notes, task_id))

        updated_task = cursor.fetchone()
        cursor.connection.commit()

        return jsonify(updated_task)
    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

