"""API routes for shift management."""
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from utils.db import get_db_cursor
from utils.auth_decorator import token_required

shift_routes = Blueprint('shifts', __name__)

@shift_routes.route('/api/shifts/patterns', methods=['GET'])
@token_required
def get_shift_patterns():
    """Get all shift patterns."""
    cursor = get_db_cursor()
    
    try:
        cursor.execute("""
            SELECT pattern_id, label, days_of_week, 
                   start_time::text, end_time::text,
                   department_id, number_of_shifts,
                   created_at, updated_at
            FROM shift_patterns 
            WHERE archived IS FALSE OR archived IS NULL
            ORDER BY created_at DESC
        """)
        patterns = cursor.fetchall()
        print("Retrieved patterns:", patterns)  # Debug log
        return jsonify(patterns)
    except Exception as e:
        print("Error in get_shift_patterns:", str(e))  # Debug log
        return jsonify({'error': 'Database error', 'details': str(e)}), 500
    finally:
        cursor.close()

@shift_routes.route('/api/shifts/patterns/<int:pattern_id>', methods=['PUT'])
@token_required
def update_shift_pattern(pattern_id):
    """Update an existing shift pattern."""
    data = request.json
    print("Updating pattern:", pattern_id, "with data:", data)  # Debug log
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    required_fields = ['label', 'days_of_week', 'start_time', 'end_time', 'department_id']
    missing_fields = [field for field in required_fields if field not in data]
    
    if missing_fields:
        return jsonify({
            'error': 'Missing required fields',
            'missing_fields': missing_fields
        }), 400
    
    cursor = get_db_cursor()
    
    try:
        cursor.execute("""
            UPDATE shift_patterns 
            SET label = %s,
                days_of_week = %s,
                start_time = %s,
                end_time = %s,
                department_id = %s,
                number_of_shifts = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE pattern_id = %s
            RETURNING pattern_id, label, days_of_week, 
                      start_time::text, end_time::text,
                      department_id, number_of_shifts
        """, (
            data['label'],
            data['days_of_week'],
            data['start_time'],
            data['end_time'],
            data['department_id'],
            data.get('number_of_shifts', 1),
            pattern_id
        ))
        
        updated_pattern = cursor.fetchone()
        if not updated_pattern:
            return jsonify({'error': 'Pattern not found'}), 404
            
        cursor.connection.commit()
        print("Updated pattern:", updated_pattern)  # Debug log
        
        return jsonify({
            'message': 'Pattern updated successfully',
            'pattern': updated_pattern
        })
    except Exception as e:
        print("Error in update_shift_pattern:", str(e))  # Debug log
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

@shift_routes.route('/api/shifts/patterns/<int:pattern_id>', methods=['DELETE'])
@token_required
def delete_shift_pattern(pattern_id):
    """Delete a shift pattern."""
    cursor = get_db_cursor()
    
    try:
        # First check if pattern exists
        cursor.execute("SELECT pattern_id FROM shift_patterns WHERE pattern_id = %s", (pattern_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Pattern not found'}), 404
            
        # Delete the pattern
        cursor.execute("DELETE FROM shift_patterns WHERE pattern_id = %s", (pattern_id,))
        cursor.connection.commit()
        
        return jsonify({'message': 'Pattern deleted successfully'})
    except Exception as e:
        print("Error in delete_shift_pattern:", str(e))  # Debug log
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

@shift_routes.route('/api/shifts/patterns', methods=['POST'])
@token_required
def create_shift_pattern():
    """Create a new shift pattern."""
    data = request.json
    print("Received data:", data)  # Debug log
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    required_fields = ['label', 'days_of_week', 'start_time', 'end_time', 'department_id']
    missing_fields = [field for field in required_fields if field not in data]
    
    if missing_fields:
        return jsonify({
            'error': 'Missing required fields',
            'missing_fields': missing_fields
        }), 400
    
    cursor = get_db_cursor()
    
    try:
        cursor.execute("""
            INSERT INTO shift_patterns (
                label, days_of_week, start_time, end_time,
                department_id, number_of_shifts
            ) VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING pattern_id, label, days_of_week, 
                      start_time::text, end_time::text,
                      department_id, number_of_shifts
        """, (
            data['label'],
            data['days_of_week'],
            data['start_time'],
            data['end_time'],
            data['department_id'],
            data.get('number_of_shifts', 1)
        ))
        
        new_pattern = cursor.fetchone()
        cursor.connection.commit()
        print("Created pattern:", new_pattern)  # Debug log
        
        return jsonify({
            'message': 'Pattern created successfully',
            'pattern': new_pattern
        })
    except Exception as e:
        print("Error in create_shift_pattern:", str(e))  # Debug log
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

@shift_routes.route('/api/shifts/generate', methods=['POST'])
@token_required
def generate_shifts():
    """Generate shifts for the next N days."""
    try:
        data = request.json
        print("Received data in generate_shifts:", data)  # Debug log
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        days_ahead = data.get('days_ahead', 14)
        if not isinstance(days_ahead, int) or days_ahead < 1:
            return jsonify({'error': 'days_ahead must be a positive integer'}), 400
            
        start_date = datetime.now().date()
        cursor = get_db_cursor()
        
        try:
            # Get shift patterns from database
            cursor.execute("""
                SELECT pattern_id, label, days_of_week, start_time, end_time,
                       department_id, number_of_shifts 
                FROM shift_patterns 
                WHERE archived IS NULL OR archived = FALSE
            """)
            patterns = cursor.fetchall()
            print(f"Found {len(patterns)} patterns in database") # Debug log
            
            if not patterns:
                return jsonify({'error': 'No shift patterns found in database'}), 400
            
            if not patterns:
                return jsonify({'message': 'No shift patterns found to generate from'}), 200
            
            shifts_generated = 0
            # Generate shifts for each day and pattern
            for day_offset in range(days_ahead):
                current_date = start_date + timedelta(days=day_offset)
                weekday = current_date.strftime("%A")
                
                for pattern in patterns:
                    # Validate required pattern fields
                    required_fields = ['days_of_week', 'label', 'start_time', 'department_id', 'number_of_shifts']
                    if not all(field in pattern for field in required_fields):
                        print(f"Warning: Pattern {pattern.get('pattern_id')} missing required fields")
                        continue
                        
                    try:
                        if weekday in pattern['days_of_week']:
                            # Check for existing shifts
                            cursor.execute("""
                                SELECT COUNT(*) as count FROM shifts 
                                WHERE date = %s AND label = %s AND start_time = %s
                            """, (current_date, pattern['label'], pattern['start_time']))
                            
                            if cursor.fetchone()['count'] == 0:
                                # Generate the required number of shifts
                                num_shifts = pattern['number_of_shifts'] or 1
                                for _ in range(num_shifts):
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
                                    shifts_generated += 1
                    except Exception as pattern_error:
                        print(f"Error processing pattern {pattern.get('pattern_id')}: {str(pattern_error)}")
                        continue
            
            cursor.connection.commit()
            return jsonify({
                'message': f'Generated {shifts_generated} shifts for next {days_ahead} days',
                'shifts_generated': shifts_generated
            })
            
        except Exception as db_error:
            cursor.connection.rollback()
            print("Database error in generate_shifts:", str(db_error))
            return jsonify({'error': 'Database error', 'details': str(db_error)}), 500
        finally:
            cursor.close()
            
    except Exception as e:
        print("Error in generate_shifts:", str(e))
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

@shift_routes.route('/api/shifts/manual', methods=['POST'])
@token_required
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
@token_required
def assign_shift(shift_id):
    """Assign an employee to a shift."""
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
@token_required
def get_weekly_shifts():
    """Get all shifts for the current week."""
    try:
        start_date_str = request.args.get('start_date')
        if not start_date_str:
            return jsonify({'error': 'start_date parameter is required'}), 400
            
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid start_date format. Use YYYY-MM-DD'}), 400
            
        department_id = request.args.get('department_id')
        employee_id = request.args.get('employee_id')
        
        cursor = get_db_cursor()
        
        try:
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
            
            query += " GROUP BY s.shift_id ORDER BY s.date, s.start_time"
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
        except Exception as db_error:
            print(f"Database error in get_weekly_shifts: {str(db_error)}")
            return jsonify({'error': 'Database error', 'details': str(db_error)}), 500
        finally:
            cursor.close()
    except Exception as e:
        print(f"Error in get_weekly_shifts: {str(e)}")
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500