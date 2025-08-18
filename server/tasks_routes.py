from flask import Blueprint, request, jsonify
from .utils.db import get_db_cursor
from .utils.auth_decorator import token_required
import logging
import psycopg2.extras

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
tasks_bp = Blueprint('tasks', __name__)

# Task Management Routes
######################## Create a new task
@tasks_bp.route('/tasks', methods=['POST'])
@token_required
def create_task():
    """Create a new task."""
    data = request.get_json() or {}

    # Validate required fields
    if not data.get('title'):
        return jsonify({'error': 'title is required'}), 400

    cursor = get_db_cursor()
    try:
        cursor.execute("""
            INSERT INTO tasks (
                title,
                description,
                status,
                priority,
                assigned_by,
                department_id,
                due_date,
                notes,
                shift_id
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s
            ) RETURNING *
        """, (
            data['title'],
            data.get('description'),
            data.get('status', 'pending'),
            data.get('priority', 'medium'),
            request.user.get('employee_id'),
            data.get('department_id'),
            data.get('due_date'),
            data.get('notes'),
            data.get('shift_id')
        ))

        new_task = cursor.fetchone()
        cursor.connection.commit()
        return jsonify(new_task), 201

    except Exception as e:
        cursor.connection.rollback()
        logger.error('Error creating task: %s', str(e), exc_info=True)
        return jsonify({'error': str(e)}), 500

    finally:
        cursor.close()

# Get all unassigned tasks
@tasks_bp.route('/tasks/unassigned', methods=['GET'])
@token_required
def get_unassigned_tasks():
    cursor = get_db_cursor()
    try:
        # Get unassigned tasks for the current department
        cursor.execute("""
            SELECT 
                t.*,
                e.name as assigned_by_name,
                d.name as department_name,
                CASE 
                    WHEN t.due_date < CURRENT_DATE THEN 'overdue'
                    WHEN t.due_date = CURRENT_DATE THEN 'due-today'
                    ELSE 'upcoming'
                END as due_status
            FROM tasks t
            LEFT JOIN employees e ON t.assigned_by = e.employee_id
            LEFT JOIN departments d ON t.department_id = d.department_id
            WHERE t.shift_id IS NULL 
            AND t.status = 'pending'
            AND t.archived = false
            AND t.department_id = %s
            ORDER BY 
                t.due_date ASC NULLS LAST,
                t.priority DESC
        """, (request.user['department_id'],))
        tasks = cursor.fetchall()
        return jsonify(tasks)
    finally:
        cursor.close()

# Get all tasks for a specific shift
@tasks_bp.route('/shifts/<int:shift_id>/tasks', methods=['GET'])
@token_required
def get_shift_tasks(shift_id):
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
            WHERE t.shift_id = %s
            ORDER BY t.due_date ASC NULLS LAST, t.priority DESC
        """, (shift_id,))
        tasks = cursor.fetchall()
        return jsonify(tasks)
    finally:
        cursor.close()

# Assign tasks to a shift
@tasks_bp.route('/shifts/<int:shift_id>/tasks', methods=['POST'])
@token_required
def assign_tasks_to_shift(shift_id):
    data = request.get_json()
    
    if not data or not data.get('task_ids'):
        return jsonify({'error': 'task_ids is required'}), 400
    
    cursor = get_db_cursor()
    try:
        # Verify shift exists
        cursor.execute("SELECT * FROM shifts WHERE shift_id = %s", (shift_id,))
        shift = cursor.fetchone()
        if not shift:
            return jsonify({'error': 'Shift not found'}), 404

        # Update tasks
        task_ids = data['task_ids']
        updated_tasks = []
        
        for task_id in task_ids:
            cursor.execute("""
                UPDATE tasks
                SET shift_id = %s,
                    updated_at = NOW()
                WHERE task_id = %s
                AND (shift_id IS NULL OR shift_id = %s)
                RETURNING *
            """, (shift_id, task_id, shift_id))
            
            updated_task = cursor.fetchone()
            if updated_task:
                updated_tasks.append(updated_task)
                cursor.connection.commit()
        return jsonify(updated_tasks)
    except Exception as e:
        logger.error('Error assigning tasks to shift: %s', str(e), exc_info=True)
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

# Remove task from shift
@tasks_bp.route('/shifts/<int:shift_id>/tasks/<int:task_id>', methods=['DELETE'])
@token_required
def remove_task_from_shift(shift_id, task_id):
    cursor = get_db_cursor()
    try:
        cursor.execute("""
            UPDATE tasks
            SET shift_id = NULL,
                updated_at = NOW()
            WHERE task_id = %s AND shift_id = %s
            RETURNING *
        """, (task_id, shift_id))
        
        task = cursor.fetchone()
        if not task:
            return jsonify({'error': 'Task not found or not assigned to this shift'}), 404
        cursor.connection.commit()
        return jsonify(task)
    except Exception as e:
        logger.error('Error removing task from shift: %s', str(e), exc_info=True)
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

# Get all tasks for current user's department
@tasks_bp.route('/tasks/department', methods=['GET'])
@token_required
def get_department_tasks():
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
            WHERE t.department_id = %s
            AND t.archived = false
            ORDER BY t.due_date ASC NULLS LAST, t.priority DESC
        """, (request.user['department_id'],))
        tasks = cursor.fetchall()
        return jsonify(tasks)
    finally:
        cursor.close()

#######################
# Authentication Routes
#######################

@tasks_bp.route('/auth/verify', methods=['POST'])
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

@tasks_bp.route('/tasks/assigned/<int:user_id>', methods=['GET'])
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

@tasks_bp.route('/tasks/<int:task_id>', methods=['PUT'])
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

#######################
# Task Pattern Routes
#######################

# Get all task patterns
@tasks_bp.route('/tasks/patterns', methods=['GET'])
@token_required
def get_task_patterns():
    logger.info('Fetching task patterns for user %s', request.user['employee_id'])
    cursor = get_db_cursor()
    try:
        cursor.execute("""
            SELECT 
                tp.pattern_id,
                tp.title,
                tp.description,
                tp.priority,
                tp.department_id,
                tp.week_number,
                tp.days_of_week,
                tp.frequency,
                tp.archived,
                tp.created_at,
                tp.updated_at,
                CASE 
                    WHEN tp.due_time IS NOT NULL 
                    THEN to_char(tp.due_time, 'HH24:MI:SS')
                    ELSE NULL 
                END as due_time,
                d.name as department_name
            FROM task_patterns tp
            LEFT JOIN departments d ON tp.department_id = d.department_id
            WHERE tp.archived = false
            AND tp.department_id = %s
            ORDER BY 
                tp.week_number, 
                tp.days_of_week[1], 
                tp.due_time
        """, (request.user['department_id'],))
        patterns = cursor.fetchall()
        logger.info('Found %d task patterns', len(patterns))
        return jsonify(patterns)
    except Exception as e:
        logger.error('Error fetching task patterns: %s', str(e), exc_info=True)
        return jsonify({'error': 'Failed to fetch task patterns'}), 500
    finally:
        cursor.close()

@tasks_bp.route('/tasks/patterns', methods=['POST'])
@token_required
def create_task_pattern():
    data = request.get_json()
    logger.info('Creating new task pattern: %s', data)
    required_fields = ['title', 'days_of_week', 'department_id']
    
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400
            
    cursor = get_db_cursor()
    try:
        # Handle due_time - convert empty string to None or format time string
        due_time = data.get('due_time')
        if due_time == "":
            due_time = None
        elif due_time:
            try:
                # Ensure time is in proper format HH:MM:SS
                if ':' not in due_time:
                    due_time = f"{due_time}:00"
                if due_time.count(':') == 1:
                    due_time = f"{due_time}:00"
            except Exception as e:
                logger.error('Error formatting due_time: %s', str(e))
                due_time = None

        cursor.execute("""
            INSERT INTO task_patterns (
                title,
                description,
                priority,
                department_id,
                week_number,
                days_of_week,
                due_time,
                frequency
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s
            ) RETURNING *
        """, (
            data['title'],
            data.get('description'),
            data.get('priority', 'medium'),
            data['department_id'],
            data.get('week_number', 1),
            data['days_of_week'],
            due_time,  # Use our processed due_time value
            data.get('frequency', 'weekly')
        ))
        new_pattern = cursor.fetchone()
        cursor.connection.commit()
        logger.info('Successfully created task pattern: %s', new_pattern)
        return jsonify(new_pattern), 201
    except Exception as e:
        cursor.connection.rollback()
        logger.error('Error creating task pattern: %s', str(e), exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

# Delete task pattern
@tasks_bp.route('/tasks/patterns/<int:pattern_id>', methods=['DELETE'])
@token_required
def delete_task_pattern(pattern_id):
    cursor = get_db_cursor()
    try:
        # First verify the pattern exists and belongs to user's department
        cursor.execute("""
            SELECT * FROM task_patterns
            WHERE pattern_id = %s AND department_id = %s
        """, (pattern_id, request.user['department_id']))
        
        pattern = cursor.fetchone()
        if not pattern:
            return jsonify({'error': 'Pattern not found or access denied'}), 404

        # Soft delete by setting archived flag
        cursor.execute("""
            UPDATE task_patterns
            SET archived = true,
                updated_at = NOW()
            WHERE pattern_id = %s
            RETURNING *
        """, (pattern_id,))
        
        deleted_pattern = cursor.fetchone()
        cursor.connection.commit()
        return jsonify(deleted_pattern)
    except Exception as e:
        cursor.connection.rollback()
        logger.error('Error deleting task pattern: %s', str(e), exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

# Update task pattern
@tasks_bp.route('/tasks/patterns/<int:pattern_id>', methods=['PUT'])
@token_required
def update_task_pattern(pattern_id):
    data = request.get_json()
    logger.info('Updating task pattern %s with data: %s', pattern_id, data)
    
    cursor = get_db_cursor()
    try:
        # First verify the pattern exists and belongs to user's department
        cursor.execute("""
            SELECT * FROM task_patterns
            WHERE pattern_id = %s AND department_id = %s
        """, (pattern_id, request.user['department_id']))
        
        pattern = cursor.fetchone()
        if not pattern:
            return jsonify({'error': 'Pattern not found or access denied'}), 404

        # Handle due_time - convert empty string to None or format time string
        due_time = data.get('due_time')
        if due_time == "":
            due_time = None
        elif due_time:
            try:
                # Ensure time is in proper format HH:MM:SS
                if ':' not in due_time:
                    due_time = f"{due_time}:00"
                if due_time.count(':') == 1:
                    due_time = f"{due_time}:00"
            except Exception as e:
                logger.error('Error formatting due_time: %s', str(e))
                due_time = None

        cursor.execute("""
            UPDATE task_patterns
            SET title = COALESCE(%s, title),
                description = COALESCE(%s, description),
                priority = COALESCE(%s, priority),
                department_id = COALESCE(%s, department_id),
                week_number = COALESCE(%s, week_number),
                days_of_week = COALESCE(%s, days_of_week),
                due_time = %s,
                frequency = COALESCE(%s, frequency),
                updated_at = NOW()
            WHERE pattern_id = %s
            RETURNING *
        """, (
            data.get('title'),
            data.get('description'),
            data.get('priority'),
            data.get('department_id'),
            data.get('week_number'),
            data.get('days_of_week'),
            due_time,
            data.get('frequency'),
            pattern_id
        ))
        
        updated_pattern = cursor.fetchone()
        cursor.connection.commit()
        logger.info('Successfully updated task pattern: %s', updated_pattern)
        return jsonify(updated_pattern)
    except Exception as e:
        cursor.connection.rollback()
        logger.error('Error updating task pattern: %s', str(e), exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()# Generate tasks from patterns

@tasks_bp.route('/tasks/generate', methods=['POST'])
@token_required
def generate_tasks():
    """Generate tasks from patterns for specified days ahead."""
    try:
        data = request.get_json() or {}
        days_ahead = int(data.get('days_ahead', 14))  # Default to 2 weeks ahead

        if days_ahead <= 0:
            return jsonify({'error': 'days_ahead must be a positive integer'}), 400

        logger.info('Starting task generation process for next %d days', days_ahead)
        cursor = get_db_cursor()

        try:
            # Step 1: Fetch all active patterns
            logger.info('Fetching active task patterns...')
            cursor.execute("""
                SELECT 
                    tp.*,
                    d.name as department_name
                FROM task_patterns tp
                LEFT JOIN departments d ON tp.department_id = d.department_id
                WHERE tp.archived = false
            """)
            patterns = cursor.fetchall()
            
            pattern_count = len(patterns)
            logger.info('Found %d active task patterns', pattern_count)
            
            if pattern_count == 0:
                return jsonify({'message': 'No active task patterns found'}), 200

            # Log pattern details
            for pattern in patterns:
                logger.info('Pattern: %s (ID: %s) - Department: %s, Frequency: %s, Days: %s', 
                          pattern['title'], 
                          pattern['pattern_id'],
                          pattern['department_name'],
                          pattern['frequency'],
                          pattern['days_of_week'])

            # Step 2: Generate date series
            logger.info('Generating date series...')
            cursor.execute("""
                SELECT generate_series(
                    CURRENT_DATE,
                    CURRENT_DATE + %s::integer,
                    '1 day'::interval
                )::date AS date
            """, (days_ahead,))
            dates = cursor.fetchall()
            
            logger.info('Generated %d dates from %s to %s', 
                       len(dates),
                       dates[0]['date'] if dates else 'N/A',
                       dates[-1]['date'] if dates else 'N/A')

            # Step 3: Generate tasks list (without inserting)
            tasks_to_create = []
            for date_row in dates:
                date = date_row['date']
                week_number = 1 if int(date.strftime('%W')) % 2 == 1 else 2
                day_of_week = int(date.strftime('%w'))  # 0 = Sunday, 6 = Saturday

                for pattern in patterns:
                    # Check if this pattern should run on this date
                    should_run = (
                        (pattern['frequency'] == 'weekly') or
                        (pattern['frequency'] == 'bi-weekly' and pattern['week_number'] == week_number)
                    ) and (day_of_week in pattern['days_of_week'])

                    if should_run:
                        task = {
                            'title': pattern['title'],
                            'description': pattern['description'],
                            'status': 'pending',
                            'priority': pattern['priority'] or 'medium',
                            'department_id': pattern['department_id'],
                            'due_date': date,
                            'notes': None,
                            'archived': False,
                            'shift_id': None
                        }
                        tasks_to_create.append(task)
                        logger.info('Planning to create task: %s for department %s on %s', 
                                  task['title'],
                                  pattern['department_name'],
                                  task['due_date'])

            # Step 4: Insert tasks one by one
            logger.info('Starting to insert %d tasks...', len(tasks_to_create))
            successful_inserts = 0
            failed_inserts = 0
            new_tasks = []

            for task in tasks_to_create:
                try:
                    cursor.execute("""
                        INSERT INTO tasks (
                            title, description, status, priority,
                            department_id, due_date, notes, archived, shift_id
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s
                        ) RETURNING *
                    """, (
                        task['title'],
                        task['description'],
                        task['status'],
                        task['priority'],
                        task['department_id'],
                        task['due_date'],
                        task['notes'],
                        task['archived'],
                        task['shift_id']
                    ))
                    
                    new_task = cursor.fetchone()
                    new_tasks.append(new_task)
                    successful_inserts += 1
                    logger.info('Successfully created task: %s (ID: %s) for %s', 
                              new_task['title'],
                              new_task['task_id'],
                              new_task['due_date'])
                    
                    cursor.connection.commit()  # Commit after each successful insert
                    
                except Exception as insert_error:
                    failed_inserts += 1
                    logger.error('Failed to insert task: %s for %s. Error: %s', 
                               task['title'],
                               task['due_date'],
                               str(insert_error))
                    cursor.connection.rollback()  # Rollback on error

            # Final summary
            logger.info('Task generation complete. Success: %d, Failed: %d', 
                       successful_inserts, 
                       failed_inserts)

            return jsonify({
                'message': f'Task generation complete. {successful_inserts} tasks created successfully, {failed_inserts} failed.',
                'successful': successful_inserts,
                'failed': failed_inserts,
                'tasks': new_tasks
            })

        except Exception as db_error:
            cursor.connection.rollback()
            logger.error('Database error in generate_tasks: %s', str(db_error), exc_info=True)
            return jsonify({'error': 'Database error', 'details': str(db_error)}), 500
        finally:
            cursor.close()
            
    except Exception as e:
        logger.error('Error in generate_tasks: %s', str(e), exc_info=True)
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

