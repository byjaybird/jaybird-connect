import React, { useState, useEffect } from 'react';
import { format, startOfWeek } from 'date-fns';
import axios from 'axios';

const EmployeeDashboard = () => {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEmployeeShifts = async () => {
    try {
      setLoading(true);
      setError(null);
      const startDate = format(startOfWeek(new Date()), 'yyyy-MM-dd');
      const response = await axios.get('/api/shifts/weekly', {
        params: {
          start_date: startDate,
          employee_id: localStorage.getItem('employeeId') 
        }
      });
      
      console.log('API Response:', response.data);
      const employeeId = localStorage.getItem('employeeId');
      const shifts = response.data.shifts || [];
      const employeeShifts = shifts.filter(shift =>
        shift.assignments.some(assignment => assignment.employee_id === employeeId)
      );
      
      setShifts(employeeShifts);
    } catch (err) {
      setError('Failed to fetch your shifts');
      console.error('Error fetching shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeeShifts();
  }, []);

  return (
    <div className="employee-dashboard">
      <h2>My Upcoming Shifts</h2>
      {loading ? (
        <div className="loading">Loading your shifts...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : shifts.length > 0 ? (
        <div className="shifts-list">
          {shifts.map((shift) => (
            <div key={shift.shift_id} className="shift-card">
              <div className="shift-date">
                {format(new Date(shift.date), 'EEEE, MMM d, yyyy')}
              </div>
              <div className="shift-time">
                {shift.start_time} - {shift.end_time}
              </div>
              {shift.label && (
                <div className="shift-label">{shift.label}</div>
              )}
              <div className="department-id">
                Department: {shift.department_id}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-shifts">
          You have no upcoming shifts scheduled.
        </div>
      )}
    </div>
  );
};

export default EmployeeDashboard;