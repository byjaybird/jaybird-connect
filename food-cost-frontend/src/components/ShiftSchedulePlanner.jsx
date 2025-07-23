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

  const [patterns, setPatterns] = useState([]);

  const fetchPatterns = async () => {
    try {
      const response = await axios.get(`${API_URL}/shifts/patterns`);
      console.log('Fetched patterns:', response.data);
      setPatterns(response.data || []);
      return response.data;
    } catch (err) {
      console.error('Error fetching patterns:', err.response?.data);
      throw new Error('Failed to fetch shift patterns');
    }
  };

  const generateShifts = async (daysAhead = 14) => {
    try {
      setLoading(true);
      setError(null);

      // First fetch patterns to validate we have some to work with
      const patterns = await fetchPatterns();
      
      if (!patterns || patterns.length === 0) {
        throw new Error('No shift patterns found. Please create at least one shift pattern before generating shifts.');
      }

      console.log('Generating shifts for days:', daysAhead);
      console.log('Using patterns:', patterns);

      const response = await axios.post(
        `${API_URL}/shifts/generate`, 
        { 
          days_ahead: daysAhead,
          patterns: patterns // Send patterns to the generate endpoint
        },
        { 
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Generation response:', response.data);
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      console.error('Error generating shifts:', err.response?.data);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to generate shifts';
      setError(`Failed to generate shifts: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch patterns when component mounts
  useEffect(() => {
    fetchPatterns();
  }, []);

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
        <div className="existing-patterns mb-4">
          <h3 className="text-lg font-semibold mb-2">Existing Patterns</h3>
          {patterns.length === 0 ? (
            <p className="text-gray-600">No shift patterns found. Please create patterns before generating shifts.</p>
          ) : (
            <div className="patterns-grid grid gap-2">
              {patterns.map(pattern => (
                <div key={pattern.pattern_id} className="pattern-card p-3 border rounded">
                  <div className="font-medium">{pattern.label}</div>
                  <div className="text-sm text-gray-600">
                    {pattern.start_time} - {pattern.end_time}
                  </div>
                  <div className="text-sm text-gray-600">
                    Days: {pattern.days_of_week.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={() => generateShifts(14)}
          disabled={loading || patterns.length === 0}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
        >
          {loading ? 'Generating...' : 'Generate Next 2 Weeks'}
        </button>
        {error && (
          <div className="error-message mt-2 text-red-500">
            {error}
          </div>
        )}
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