import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays } from 'date-fns';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

const EmployeeDashboard = () => {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getEmployeeId = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }
    
    try {
      const decoded = jwtDecode(token);
      console.log('Decoded token:', decoded);
      if (!decoded.employee_id) {
        throw new Error('Employee ID not found in token');
      }
      return decoded.employee_id;
    } catch (err) {
      console.error('Error decoding token:', err);
      throw new Error('Invalid authentication token');
    }
  };

  const fetchEmployeeShifts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const employeeId = getEmployeeId();
      const startDate = format(startOfWeek(new Date()), 'yyyy-MM-dd');
      console.log('Making request to:', `${API_URL}/shifts/weekly`);
      console.log('With params:', {
          start_date: startDate,
          employee_id: employeeId
      });
      
      const response = await axios.get(`${API_URL}/shifts/weekly`, {
        params: {
          start_date: startDate,
          employee_id: employeeId
        }
      });
      
      console.log('API Response:', response.data);

      const shifts = response.data.shifts || [];
      const employeeShifts = shifts.filter(shift =>
        shift.assignments.some(assignment => assignment.employee_id === employeeId)
      );
      
      setShifts(employeeShifts);
    } catch (err) {
      console.error('Full error object:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      setError('Failed to fetch your shifts');
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