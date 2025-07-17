from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor
from functools import wraps
from utils.auth_decorator import token_required
import os
import jwt

tasks_bp = Blueprint('tasks', __name__)

@tasks_bp.route('/api/auth/verify', methods=['POST'])
@token_required
def verify_auth():
    try:
        cursor = get_db_cursor()
        employee = request.user

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

