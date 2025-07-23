"""API routes for shift management."""
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor

shift_routes = Blueprint('shifts', __name__)

@shift_routes.route('/api/shifts/patterns', methods=['GET'])
def get_shift_patterns():
    """Get all shift patterns."""
    cursor = get_db_cursor()
    
    cursor.execute("""
        SELECT * FROM shift_patterns 
        WHERE archived IS NULL OR archived = FALSE
        ORDER BY created_at DESC
    """)
    patterns = cursor.fetchall()
    
    return jsonify(patterns)

@shift_routes.route('/api/shifts/patterns', methods=['POST'])
def create_shift_pattern():
    """Create a new shift pattern."""
    data = request.json
    cursor = get_db_cursor()
    
    try:
        cursor.execute("""
            INSERT INTO shift_patterns (
                label, days_of_week, start_time, end_time,
                department_id, number_of_shifts
            ) VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING pattern_id
        """, (
            data['label'],
            data['days_of_week'],
            data['start_time'],
            data['end_time'],
            data['department_id'],
            data.get('number_of_shifts', 1)
        ))
        
        pattern_id = cursor.fetchone()['pattern_id']
        cursor.connection.commit()
        
        return jsonify({
            'pattern_id': pattern_id,
            'message': 'Pattern created successfully'
        })
    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500

@shift_routes.route('/api/shifts/generate', methods=['POST'])
def generate_shifts():
    """Generate shifts for the next N days."""
    days_ahead = request.json.get('days_ahead', 14)
    start_date = datetime.now().date()
    
    cursor = get_db_cursor()
    
    # Get all shift patterns
    cursor.execute("""
        SELECT * FROM shift_patterns 
        WHERE archived IS NULL OR archived = FALSE
    """)
    patterns = cursor.fetchall()
    
    # Generate shifts for each day and pattern
    for day_offset in range(days_ahead):
        current_date = start_date + timedelta(days=day_offset)
        weekday = current_date.strftime("%A")
        
        for pattern in patterns:
            if weekday in pattern['days_of_week']:
                # Check for existing shifts
                cursor.execute("""
                    SELECT * FROM shifts 
                    WHERE date = %s AND label = %s AND start_time = %s
                """, (current_date, pattern['label'], pattern['start_time']))
                
                if not cursor.fetchone():
                    # Generate the required number of shifts
                    for _ in range(pattern['number_of_shifts']):
                        cursor.execute("""
                            INSERT INTO shifts (
                                department_id, start_time, end_time, date, label, 
                                generated_from_template, source_label, is_part_of_schedule, 
                                schedule_pattern_id
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            pattern['department_id'], pattern['start_time'], pattern['end_time'],
                            current_date, pattern['label'], True, pattern['label'], True,
                            pattern['pattern_id']
                        ))
    
    cursor.connection.commit()
    return jsonify({'message': f'Generated shifts for next {days_ahead} days'})

@shift_routes.route('/api/shifts/manual', methods=['POST'])
def create_manual_shift():
    """Create a one-off shift manually."""
    data = request.json
    cursor = get_db_cursor()
    
    cursor.execute("""
        INSERT INTO shifts (
            department_id, start_time, end_time, date, label,
            generated_from_template, is_part_of_schedule
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING shift_id
    """, (
        data['department_id'],
        data['start_time'],
        data['end_time'],
        datetime.strptime(data['date'], '%Y-%m-%d').date(),
        data.get('label'),
        False,
        False
    ))
    
    shift_id = cursor.fetchone()['shift_id']
    cursor.connection.commit()
    
    return jsonify({
        'shift_id': shift_id,
        'message': 'Shift created successfully'
    })

@shift_routes.route('/api/shifts/<int:shift_id>/assign', methods=['POST'])
def assign_shift():
    """Assign an employee to a shift."""
    shift_id = request.view_args['shift_id']
    employee_id = request.json['employee_id']
    cursor = get_db_cursor()
    
    # Check if shift already assigned
    cursor.execute("""
        SELECT * FROM shift_assignments 
        WHERE shift_id = %s
    """, (shift_id,))
    existing = cursor.fetchone()
    
    if existing:
        cursor.execute("""
            UPDATE shift_assignments 
            SET employee_id = %s, assigned_at = NOW() 
            WHERE shift_assignment_id = %s
            RETURNING shift_assignment_id
        """, (employee_id, existing['shift_assignment_id']))
    else:
        cursor.execute("""
            INSERT INTO shift_assignments (shift_id, employee_id, assigned_at)
            VALUES (%s, %s, NOW())
            RETURNING shift_assignment_id
        """, (shift_id, employee_id))
    
    assignment_id = cursor.fetchone()['shift_assignment_id']
    cursor.connection.commit()
    
    return jsonify({
        'assignment_id': assignment_id,
        'message': 'Employee assigned successfully'
    })

@shift_routes.route('/api/shifts/weekly', methods=['GET'])
def get_weekly_shifts():
    """Get all shifts for the current week."""
    start_date = datetime.strptime(request.args.get('start_date'), '%Y-%m-%d').date()
    department_id = request.args.get('department_id')
    employee_id = request.args.get('employee_id')
    
    cursor = get_db_cursor()
    
    query = """
        SELECT s.*, array_agg(json_build_object(
            'employee_id', sa.employee_id,
            'assigned_at', sa.assigned_at
        )) as assignments
        FROM shifts s
        LEFT JOIN shift_assignments sa ON s.shift_id = sa.shift_id
        WHERE s.date >= %s AND s.date < %s
    """
    params = [start_date, start_date + timedelta(days=7)]
    
    if department_id:
        query += " AND s.department_id = %s"
        params.append(department_id)
        
    if employee_id:
        query += " AND sa.employee_id = %s"
        params.append(employee_id)
    
    query += " GROUP BY s.shift_id"
    cursor.execute(query, tuple(params))
    shifts = cursor.fetchall()
    
    return jsonify({
        'shifts': [{
            'shift_id': s['shift_id'],
            'date': s['date'].isoformat(),
            'start_time': s['start_time'].strftime('%H:%M'),
            'end_time': s['end_time'].strftime('%H:%M'),
            'label': s['label'],
            'department_id': s['department_id'],
            'assignments': [a for a in s['assignments'] if a is not None]
        } for s in shifts]
    })