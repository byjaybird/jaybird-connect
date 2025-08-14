"""API service for handling shift-related operations."""
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from flask import jsonify
from utils.db import get_db_cursor

class ShiftAPI:
    @staticmethod
    def get_weekly_shifts(start_date: str, department_id: Optional[int] = None, employee_id: Optional[int] = None) -> Dict:
        """Get all shifts for a week starting from the given date.
        
        Args:
            start_date: Start date in YYYY-MM-DD format
            department_id: Optional department filter
            employee_id: Optional employee filter
            
        Returns:
            Dictionary with shifts list
        """
        cursor = get_db_cursor()
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = start + timedelta(days=7)
        
        query = """
            SELECT s.*, array_agg(json_build_object(
                'employee_id', sa.employee_id,
                'assigned_at', sa.assigned_at::text
            )) as assignments
            FROM shifts s
            LEFT JOIN shift_assignments sa ON s.shift_id = sa.shift_id
            WHERE s.date >= %s AND s.date < %s
        """
        params = [start, end]
        
        if department_id:
            query += " AND s.department_id = %s"
            params.append(department_id)
            
        if employee_id:
            query += " AND sa.employee_id = %s"
            params.append(employee_id)
        
        query += " GROUP BY s.shift_id ORDER BY s.date, s.start_time"
        cursor.execute(query, tuple(params))
        shifts = cursor.fetchall()
        
        return {
            'shifts': [{
                'shift_id': s['shift_id'],
                'date': s['date'].isoformat(),
                'start_time': s['start_time'].strftime('%H:%M'),
                'end_time': s['end_time'].strftime('%H:%M'),
                'label': s['label'],
                'department_id': s['department_id'],
                'assignments': [a for a in s['assignments'] if a is not None]
            } for s in shifts]
        }

    @staticmethod
    def create_manual_shift(shift_data: Dict) -> Dict:
        """Create a one-off shift manually.
        
        Args:
            shift_data: Dictionary containing shift details
            
        Returns:
            Created shift data
        """
        cursor = get_db_cursor()
        cursor.execute("""
            INSERT INTO shifts (
                date, start_time, end_time, department_id, label,
                generated_from_template, is_part_of_schedule
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING shift_id
        """, (
            datetime.strptime(shift_data['date'], '%Y-%m-%d').date(),
            shift_data['start_time'],
            shift_data['end_time'],
            shift_data['department_id'],
            shift_data.get('label'),
            False,
            False
        ))
        
        result = cursor.fetchone()
        cursor.connection.commit()
        return {
            'shift_id': result['shift_id'],
            'message': 'Shift created successfully'
        }

    @staticmethod
    def assign_employee(shift_id: int, employee_id: int) -> Dict:
        """Assign an employee to a shift.
        
        Args:
            shift_id: ID of the shift
            employee_id: ID of the employee
            
        Returns:
            Assignment confirmation
        """
        cursor = get_db_cursor()
        
        # Check if shift exists
        cursor.execute("SELECT * FROM shifts WHERE shift_id = %s", (shift_id,))
        if not cursor.fetchone():
            return {'error': 'Shift not found'}, 404

        # Check if employee exists
        cursor.execute("SELECT * FROM employees WHERE employee_id = %s", (employee_id,))
        if not cursor.fetchone():
            return {'error': 'Employee not found'}, 404

        # Check for existing assignment
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
            """, (employee_id, existing['shift_assignment_id']))
        else:
            cursor.execute("""
                INSERT INTO shift_assignments (shift_id, employee_id, assigned_at)
                VALUES (%s, %s, NOW())
            """, (shift_id, employee_id))

        cursor.connection.commit()
        return {'message': 'Employee assigned successfully'}

    @staticmethod
    def get_employee_shifts(employee_id: int, start_date: Optional[str] = None) -> Dict:
        """Get all upcoming shifts for an employee.
        
        Args:
            employee_id: ID of the employee
            start_date: Optional start date filter (defaults to today)
            
        Returns:
            Dictionary with shifts list
        """
        cursor = get_db_cursor()
        
        if start_date:
            start = datetime.strptime(start_date, '%Y-%m-%d').date()
        else:
            start = datetime.now().date()

        cursor.execute("""
            SELECT s.* 
            FROM shifts s
            JOIN shift_assignments sa ON s.shift_id = sa.shift_id
            WHERE sa.employee_id = %s AND s.date >= %s
            ORDER BY s.date, s.start_time
        """, (employee_id, start))
        
        shifts = cursor.fetchall()
        return {
            'shifts': [{
                'shift_id': s['shift_id'],
                'date': s['date'].isoformat(),
                'start_time': s['start_time'].strftime('%H:%M'),
                'end_time': s['end_time'].strftime('%H:%M'),
                'label': s['label'],
                'department_id': s['department_id']
            } for s in shifts]
        }

    @staticmethod
    def generate_shifts_from_pattern(pattern_id: str, days_ahead: int = 14) -> Dict:
        """Generate shifts based on a shift pattern.
        
        Args:
            pattern_id: ID of the shift pattern
            days_ahead: Number of days to generate shifts for
            
        Returns:
            Generation confirmation
        """
        cursor = get_db_cursor()
        
        # Get pattern
        cursor.execute("""
            SELECT * FROM shift_patterns 
            WHERE pattern_id = %s AND (archived IS NULL OR archived = FALSE)
        """, (pattern_id,))
        pattern = cursor.fetchone()
        
        if not pattern:
            return {'error': 'Pattern not found'}, 404

        start_date = datetime.now().date()
        shifts_created = 0

        for day_offset in range(days_ahead):
            current_date = start_date + timedelta(days=day_offset)
            weekday = current_date.strftime('%A')

            if weekday in pattern['days_of_week']:
                # Check for existing shifts
                cursor.execute("""
                    SELECT * FROM shifts 
                    WHERE date = %s AND label = %s AND start_time = %s
                """, (current_date, pattern['label'], pattern['start_time']))

                if not cursor.fetchone():
                    # Generate required number of shifts
                    for _ in range(pattern['number_of_shifts']):
                        cursor.execute("""
                            INSERT INTO shifts (
                                department_id, start_time, end_time, date, label,
                                generated_from_template, source_label, is_part_of_schedule,
                                schedule_pattern_id
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            pattern['department_id'],
                            pattern['start_time'],
                            pattern['end_time'],
                            current_date,
                            pattern['label'],
                            True,
                            pattern['label'],
                            True,
                            pattern['pattern_id']
                        ))
                        shifts_created += 1

        cursor.connection.commit()
        return {'message': f'Generated {shifts_created} shifts successfully'}