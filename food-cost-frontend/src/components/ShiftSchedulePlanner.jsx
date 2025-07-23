import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays } from 'date-fns';
import axios from 'axios';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

const ShiftSchedulePlanner = () => {
  const [selectedWeekStart, setSelectedWeekStart] = useState(startOfWeek(new Date()));
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchWeeklyShifts = async (startDate) => {
    try {
      setLoading(true);
      setError(null);
      console.log('Making request to:', `${API_URL}/shifts/weekly`);
      console.log('With params:', { start_date: format(startDate, 'yyyy-MM-dd') });
      const response = await axios.get(`${API_URL}/shifts/weekly`, {
        params: {
          start_date: format(startDate, 'yyyy-MM-dd')
        }
      });
console.log('API Response:', response.data);
      setShifts(response.data.shifts || []);
    } catch (err) {
      console.error('Full error object:', err);
      console.error('Error response:', err.response?.data);
      setError('Failed to fetch shifts');
    } finally {
      setLoading(false);
    }
  };

  const addManualShift = async (shiftData) => {
    try {
      setLoading(true);
      setError(null);
      console.log('Adding manual shift:', shiftData);
      await axios.post(`${API_URL}/shifts/manual`, shiftData);
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      console.error('Error creating shift:', err.response?.data);
      setError('Failed to create shift');
    } finally {
      setLoading(false);
    }
  };

  const generateShifts = async (daysAhead = 14) => {
    try {
      setLoading(true);
      setError(null);
      console.log('Generating shifts for days:', daysAhead);
      await axios.post(`${API_URL}/shifts/generate`, { days_ahead: daysAhead });
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      console.error('Error generating shifts:', err.response?.data);
      setError('Failed to generate shifts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeeklyShifts(selectedWeekStart);
  }, [selectedWeekStart]);

  return (
    <div className="shift-schedule-planner">
      <div className="week-navigation">
        <button
          onClick={() => setSelectedWeekStart(date => addDays(date, -7))}
        >
          Previous Week
        </button>
        <span>{format(selectedWeekStart, 'MMM d, yyyy')}</span>
        <button
          onClick={() => setSelectedWeekStart(date => addDays(date, 7))}
        >
          Next Week
        </button>
      </div>

      <div className="weekly-calendar">
        {loading ? (
          <div className="loading">Loading shifts...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : (
          [...Array(7)].map((_, index) => {
            const date = addDays(selectedWeekStart, index);
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayShifts = shifts.filter(shift => shift.date === dateStr);
            
            return (
              <div key={dateStr} className="day-column">
                <h3>{format(date, 'EEEE, MMM d')}</h3>
                <div className="shifts-container">
                  {dayShifts.map(shift => (
                    <div key={shift.shift_id} className="shift-item">
                      <div className="shift-time">
                        {shift.start_time} - {shift.end_time}
                      </div>
                      {shift.label && <div className="shift-label">{shift.label}</div>}
                      <div className="assignments">
                        {shift.assignments.map(assignment => (
                          <div key={assignment.employee_id} className="assigned-employee">
                            Employee ID: {assignment.employee_id}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="shift-controls">
        <button 
          onClick={() => generateShifts(14)}
          disabled={loading}
        >
          Generate Next 2 Weeks
        </button>
      </div>

      <div className="add-shift-form">
        <h3>Add Manual Shift</h3>
        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          addManualShift({
            date: formData.get('date'),
            start_time: formData.get('start_time'),
            end_time: formData.get('end_time'),
            department_id: formData.get('department_id'),
            label: formData.get('label')
          });
          e.target.reset();
        }}>
          <input type="date" name="date" required />
          <input type="time" name="start_time" required />
          <input type="time" name="end_time" required />
          <input type="number" name="department_id" required placeholder="Department ID" />
          <input type="text" name="label" placeholder="Shift Label" />
          <button type="submit" disabled={loading}>Add Shift</button>
        </form>
      </div>
    </div>
  );
};

export default ShiftSchedulePlanner;