"""Service for managing shift patterns."""
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict
from utils.db import get_db_cursor

class ShiftPatternService:
    @staticmethod
    def get_patterns() -> List[Dict]:
        """Get all active shift patterns.
        
        Returns:
            List of shift pattern dictionaries
        """
        cursor = get_db_cursor()
        cursor.execute("""
            SELECT * FROM shift_patterns 
            WHERE archived IS NULL OR archived = FALSE
        """)
        return cursor.fetchall()

    @staticmethod
    def create_pattern(pattern_data: Dict) -> Dict:
        """Create a new shift pattern.
        
        Args:
            pattern_data: Dictionary containing pattern details
            
        Returns:
            Created pattern data
        """
        cursor = get_db_cursor()
        cursor.execute("""
            INSERT INTO shift_patterns (
                label, days_of_week, start_time, end_time,
                department_id, number_of_shifts
            ) VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            pattern_data['label'],
            pattern_data['days_of_week'],
            pattern_data['start_time'],
            pattern_data['end_time'],
            pattern_data['department_id'],
            pattern_data['number_of_shifts']
        ))
        pattern = cursor.fetchone()
        cursor.connection.commit()
        return pattern

    @staticmethod
    def update_pattern(pattern_id: str, pattern_data: Dict) -> Dict:
        """Update an existing shift pattern.
        
        Args:
            pattern_id: ID of the pattern to update
            pattern_data: Dictionary containing updated pattern details
            
        Returns:
            Updated pattern data
        """
        cursor = get_db_cursor()
        cursor.execute("""
            UPDATE shift_patterns 
            SET label = %s,
                days_of_week = %s,
                start_time = %s,
                end_time = %s,
                department_id = %s,
                number_of_shifts = %s
            WHERE pattern_id = %s
            RETURNING *
        """, (
            pattern_data['label'],
            pattern_data['days_of_week'],
            pattern_data['start_time'],
            pattern_data['end_time'],
            pattern_data['department_id'],
            pattern_data['number_of_shifts'],
            pattern_id
        ))
        pattern = cursor.fetchone()
        cursor.connection.commit()
        return pattern

    @staticmethod
    def delete_pattern(pattern_id: str) -> None:
        """Delete a shift pattern.
        
        Args:
            pattern_id: ID of the pattern to delete
        """
        cursor = get_db_cursor()
        cursor.execute("""
            UPDATE shift_patterns 
            SET archived = TRUE 
            WHERE pattern_id = %s
        """, (pattern_id,))
        cursor.connection.commit()
