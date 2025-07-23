import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays } from 'date-fns';
import axios from 'axios';

const ShiftSchedulePlanner = () => {
  const [selectedWeekStart, setSelectedWeekStart] = useState(startOfWeek(new Date()));
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch shifts for the selected week
  const fetchWeeklyShifts = async (startDate) => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/shifts/weekly', {
        params: {
          start_date: format(startDate, 'yyyy-MM-dd')
        }
      });
      setShifts(response.data.shifts);
    } catch (err) {
      setError('Failed to fetch shifts');
      console.error('Error fetching shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  // Add a new manual shift
  const addManualShift = async (shiftData) => {
    try {
      setLoading(true);
      setError(null);
      await axios.post('/api/shifts/manual', shiftData);
      // Refresh the shifts list
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      setError('Failed to create shift');
      console.error('Error creating shift:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate shifts for the next N days
  const generateShifts = async (daysAhead = 14) => {
    try {
      setLoading(true);
      setError(null);
      await axios.post('/api/shifts/generate', { days_ahead: daysAhead });
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      setError('Failed to generate shifts');
      console.error('Error generating shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch shifts when the selected week changes
  useEffect(() => {
    fetchWeeklyShifts(selectedWeekStart);
  }, [selectedWeekStart]);

  return (
    <div className="shift-schedule-planner">
      {/* Week Navigation */}
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

      {/* Weekly Calendar */}
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

      {/* Controls */}
      <div className="shift-controls">
        <button 
          onClick={() => generateShifts(14)}
          disabled={loading}
        >
          Generate Next 2 Weeks
        </button>
      </div>

      {/* Add Manual Shift Form */}
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