import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { format, startOfWeek, addDays } from 'date-fns';

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

const ShiftPatternConfigurator = () => {
  console.log('ShiftPatternConfigurator rendering');

  // Utility function to safely format time strings
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    try {
      // Handle different possible formats
      if (timeStr.includes('T')) {
        // ISO format like "0000-01-01T11:00:00Z"
        const time = timeStr.split('T')[1];
        return time.slice(0, 5); // Get "HH:mm"
      } else if (timeStr.includes(':')) {
        // Already in HH:mm:ss format
        return timeStr.slice(0, 5); // Get "HH:mm"
      }
      return '';
    } catch (e) {
      console.error('Error parsing time:', e, timeStr);
      return '';
    }
  };
  
  const [departments, setDepartments] = useState([]);
  const [pattern, setPattern] = useState({
    days_of_week: [],
    number_of_shifts: 1,
    label: '',
    start_time: '',
    end_time: '',
    department_id: ''
  });
  const [patterns, setPatterns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingPattern, setEditingPattern] = useState(null);
  
  // Schedule state
  const [selectedWeekStart, setSelectedWeekStart] = useState(startOfWeek(new Date()));
  const [shifts, setShifts] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Check auth status first
        try {
          await checkAuthStatus();
        } catch (authError) {
          console.error('ShiftPatternConfigurator: Authentication check failed');
          window.location.href = '/login';
          return;
        }
        
        // Fetch all available tasks
        const tasksResponse = await api.get('/tasks/unassigned');
        setTasks(tasksResponse.data);
        
        // Fetch departments
        const deptResponse = await api.get('/departments');
        setDepartments(deptResponse.data);

        // Fetch patterns
        const patternsResponse = await api.get('/shifts/patterns');
        setPatterns(patternsResponse.data);

        // Fetch employees
        const employeesResponse = await api.get('/users');
        setEmployees(employeesResponse.data.filter(emp => emp.active)); // Only get active employees

        setError(null);
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load initial data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const handleAssignEmployee = async (employeeId) => {
    try {
      console.log('Assigning employee:', employeeId, 'to shift:', selectedShift);
      setScheduleLoading(true);
await api.put(`/shifts/patterns/${editingPattern}`, formattedPattern);
      
      // Refresh patterns
      const response = await api.get('/shifts/patterns');
      
      // Assign employee to shift
      await axios.post(`${API_URL}/shifts/${selectedShift.shift_id}/assign`, 
        { employee_id: employeeId },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      // If there are selected tasks, assign them to the shift as well
      if (selectedTaskIds.length > 0) {
        await axios.post(`${API_URL}/shifts/${selectedShift.shift_id}/tasks`, 
          { task_ids: selectedTaskIds },
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
      }
      await fetchWeeklyShifts(selectedWeekStart);
      setAssignmentModalOpen(false);
      setSelectedShift(null);
    } catch (err) {
      console.error('Error assigning employee:', err);
      setScheduleError('Failed to assign employee to shift');
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleRemoveAssignment = async (shiftId, employeeId) => {
    try {
      setScheduleLoading(true);
await api.post('/shifts/patterns', formattedPattern);
      
      // Refresh patterns after creating new one
      const response = await api.get('/shifts/patterns');
      await axios.delete(`${API_URL}/shifts/${shiftId}/assign/${employeeId}`, { // The endpoint might need to be adjusted if it expects user_id
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      console.error('Error removing assignment:', err);
      setScheduleError('Failed to remove employee from shift');
    } finally {
      setScheduleLoading(false);
    }
  };

  // Original fetchDepartments function removed since it's now part of fetchInitialData
  // Fetch patterns function
  const fetchPatterns = async () => {
    try {
      setIsLoading(true);
await api.post(`/shifts/${selectedShift.shift_id}/assign`, 
        { employee_id: employeeId }
      );
      const response = await axios.get(`${API_URL}/shifts/patterns`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setPatterns(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching patterns:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load patterns');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePattern = async (updatedPattern) => {
    try {
      setIsCreating(true);
await api.delete(`/shifts/${shiftId}/assign/${employeeId}`);

      // Format the data for the API - send only the time portion
      const formattedPattern = {
        ...updatedPattern,
        start_time: `${updatedPattern.start_time}:00`,
        end_time: `${updatedPattern.end_time}:00`
      };

      await axios.put(`${API_URL}/shifts/patterns/${editingPattern}`, formattedPattern, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Refresh patterns
      const response = await axios.get(`${API_URL}/shifts/patterns`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setPatterns(response.data);
      
      // Reset form
      setPattern({
        days_of_week: [],
        number_of_shifts: 1,
        label: '',
        start_time: '',
        end_time: '',
        department_id: ''
      });
      setEditingPattern(null);
      setError(null);
    } catch (err) {
      console.error('Error updating pattern:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update pattern');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreatePattern = async (newPattern) => {
    try {
      setIsCreating(true);
      const token = localStorage.getItem('token');
      
      // Format the data for the API - send only the time portion
      const formattedPattern = {
        ...newPattern,
        start_time: `${newPattern.start_time}:00`,
        end_time: `${newPattern.end_time}:00`
      };

      await axios.post(`${API_URL}/shifts/patterns`, formattedPattern, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Refresh patterns after creating new one
      const response = await axios.get(`${API_URL}/shifts/patterns`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setPatterns(response.data);
      
      // Reset form
      setPattern({
        days_of_week: [],
        number_of_shifts: 1,
        label: '',
        start_time: '',
        end_time: '',
        department_id: ''
      });
      setError(null);
    } catch (err) {
      console.error('Error creating pattern:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create pattern');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = (patternToEdit) => {
    // Handle days_of_week regardless if it's an array or string
    const daysArray = Array.isArray(patternToEdit.days_of_week) 
      ? patternToEdit.days_of_week 
      : typeof patternToEdit.days_of_week === 'string'
        ? patternToEdit.days_of_week.replace(/[{"}]/g, '').split(',')
        : [];
    
    const startTime = formatTime(patternToEdit.start_time);
    const endTime = formatTime(patternToEdit.end_time);
    
    setPattern({
      ...patternToEdit,
      days_of_week: daysArray,
      start_time: startTime,
      end_time: endTime
    });
    setEditingPattern(patternToEdit.pattern_id);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleDelete = async (patternId) => {
    if (!window.confirm('Are you sure you want to delete this pattern?')) {
      return;
    }

    try {
      await api.delete(`/shifts/patterns/${patternId}`);
      
      // Remove the pattern from the list
      setPatterns(patterns.filter(p => p.pattern_id !== patternId));
      setError(null);
    } catch (err) {
      console.error('Error deleting pattern:', err);
      setError(err.response?.data?.message || err.message || 'Failed to delete pattern');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (pattern.label && pattern.start_time && pattern.end_time && pattern.department_id && pattern.days_of_week.length > 0) {
        // Prepare data for API - ensure days_of_week is in correct format
        const patternData = {
          ...pattern,
          days_of_week: Array.isArray(pattern.days_of_week) ? pattern.days_of_week : [pattern.days_of_week]
        };
        
        if (editingPattern) {
          await handleUpdatePattern(patternData);
        } else {
          await handleCreatePattern(patternData);
        }
      } else {
        setError('Please fill in all required fields and select at least one day');
      }
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError(err.message || 'Failed to submit pattern');
    }
  };

  const handleDayToggle = (day) => {
    setPattern(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day]
    }));
  };

  // Schedule management functions
  const fetchWeeklyShifts = async (startDate) => {
    try {
      setScheduleLoading(true);
      setScheduleError(null);
      const response = await api.get('/shifts/weekly', {
        params: {
          start_date: format(startDate, 'yyyy-MM-dd')
        }
      });
      
      const shiftsData = response.data.shifts || [];
      console.log('Fetched shifts:', shiftsData);
      
      // Verify shift data structure
      shiftsData.forEach(shift => {
        console.log(`Shift ${shift.shift_id}:`, {
          department_id: shift.department_id,
          assignments: shift.assignments,
          date: shift.date,
          times: `${shift.start_time} - ${shift.end_time}`
        });
      });
      
      setShifts(shiftsData);
    } catch (err) {
      console.error('Error fetching shifts:', err);
      setScheduleError('Failed to fetch shifts');
    } finally {
      setScheduleLoading(false);
    }
  };

  const addManualShift = async (shiftData) => {
    try {
      setScheduleLoading(true);
      setScheduleError(null);
      await api.post('/shifts/manual', shiftData);
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      console.error('Error creating shift:', err);
      setScheduleError('Failed to create shift');
    } finally {
      setScheduleLoading(false);
    }
  };

  const generateShifts = async (daysAhead = 14) => {
    try {
      setScheduleLoading(true);
      setScheduleError(null);
      const token = localStorage.getItem('token');
      
      // Generate shifts with just the days_ahead parameter
      await axios.post(`${API_URL}/shifts/generate`, 
        { days_ahead: daysAhead },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      // Refresh the displayed shifts
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      console.error('Error generating shifts:', err);
      if (err.response?.data?.message) {
        setScheduleError(err.response.data.message);
      } else {
        setScheduleError('Failed to generate shifts: ' + err.message);
      }
    } finally {
      setScheduleLoading(false);
    }
  };

  // Fetch shifts when week changes
  useEffect(() => {
    fetchWeeklyShifts(selectedWeekStart);
  }, [selectedWeekStart]);

  return (
    <div className="shift-pattern-configurator p-6">
      <h2 className="text-2xl font-bold mb-6">Shift Patterns</h2>

      {/* Display existing patterns */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Existing Patterns</h3>
        {isLoading && <div>Loading patterns...</div>}
        {error && (
          <div className="text-red-600 mb-4">
            {error}
          </div>
        )}
        {patterns && patterns.length === 0 && <div>No patterns defined yet</div>}
        {patterns && patterns.length > 0 && (
          <div className="grid gap-4">
            {patterns.map(pattern => (
              <div key={pattern.pattern_id} className="border p-4 rounded-lg bg-white shadow">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold">{pattern.label}</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(pattern)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(pattern.pattern_id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p>Days: {Array.isArray(pattern.days_of_week) 
  ? pattern.days_of_week.join(', ')
  : typeof pattern.days_of_week === 'string' 
    ? pattern.days_of_week.replace(/[{"}]/g, '').split(',').join(', ')
    : ''}</p>
                <p>Time: {formatTime(pattern.start_time)} - {formatTime(pattern.end_time)}</p>
                <p>Department: {departments.find(d => d.department_id === pattern.department_id)?.name || 'Unknown'}</p>
                <p>Number of Shifts: {pattern.number_of_shifts}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="text-xl font-semibold mb-4">Create New Pattern</h3>
      
      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
        <div className="mb-4">
          <label htmlFor="label" className="block text-sm font-medium text-gray-700 mb-2">
            Pattern Label
          </label>
          <input
            type="text"
            id="label"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={pattern.label || ''}
            onChange={e => setPattern(prev => ({ ...prev, label: e.target.value }))}
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Days of Week</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {DAYS_OF_WEEK.map(day => (
              <label key={day} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={pattern.days_of_week.includes(day)}
                  onChange={() => handleDayToggle(day)}
                />
                {day}
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="start_time" className="block text-sm font-medium text-gray-700 mb-2">
            Start Time
          </label>
          <input
            type="time"
            id="start_time"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={pattern.start_time || ''}
            onChange={e => setPattern(prev => ({ ...prev, start_time: e.target.value }))}
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="end_time" className="block text-sm font-medium text-gray-700 mb-2">
            End Time
          </label>
          <input
            type="time"
            id="end_time"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={pattern.end_time || ''}
            onChange={e => setPattern(prev => ({ ...prev, end_time: e.target.value }))}
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="department_id" className="block text-sm font-medium text-gray-700 mb-2">
            Department
          </label>
          <select
            id="department_id"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={pattern.department_id || ''}
            onChange={e => setPattern(prev => ({ ...prev, department_id: Number(e.target.value) }))}
            required
          >
            <option value="">Select a department</option>
            {departments.map(dept => (
              <option key={dept.department_id} value={dept.department_id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="number_of_shifts" className="block text-sm font-medium text-gray-700 mb-2">
            Number of Shifts
          </label>
          <input
            type="number"
            id="number_of_shifts"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1"
            value={pattern.number_of_shifts}
            onChange={e => setPattern(prev => ({ ...prev, number_of_shifts: Number(e.target.value) }))}
            required
          />
        </div>

        <button
          type="submit"
          disabled={isCreating}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed"
        >
          {isCreating ? (editingPattern ? 'Updating...' : 'Creating...') : (editingPattern ? 'Update Pattern' : 'Create Pattern')}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {/* Weekly Schedule Section */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold mb-6">Weekly Schedule</h2>
        
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setSelectedWeekStart(date => addDays(date, -7))}
            className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
          >
            Previous Week
          </button>
          <span className="text-lg font-semibold">
            Week of {format(selectedWeekStart, 'MMM d, yyyy')}
          </span>
          <button
            onClick={() => setSelectedWeekStart(date => addDays(date, 7))}
            className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
          >
            Next Week
          </button>
        </div>

        <div className="grid grid-cols-7 gap-4 mb-6">
          {scheduleLoading ? (
            <div className="col-span-7 text-center py-4">Loading shifts...</div>
          ) : scheduleError ? (
            <div className="col-span-7 text-center py-4 text-red-600">{scheduleError}</div>
          ) : (
            [...Array(7)].map((_, index) => {
              const date = addDays(selectedWeekStart, index);
              const dateStr = format(date, 'yyyy-MM-dd');
              const dayShifts = shifts.filter(shift => shift.date === dateStr);
              
              return (
                <div key={dateStr} className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-2">{format(date, 'EEE, MMM d')}</h3>
                  <div className="space-y-2">
                    {dayShifts.map(shift => (
                      <div 
                        key={shift.shift_id} 
                        className="bg-blue-50 p-2 rounded cursor-pointer hover:bg-blue-100"
                        onClick={() => {
                          setSelectedShift(shift);
                          setAssignmentModalOpen(true);
                        }}
                      >
                        <div className="text-sm font-medium">
                          {shift.start_time} - {shift.end_time}
                        </div>
                        {shift.label && (
                          <div className="text-sm text-gray-600">{shift.label}</div>
                        )}
                        {shift.assignments?.map(assignment => {
                          const employee = employees.find(e => e.employee_id === assignment.user_id);
                          return (
                            <div key={assignment.user_id} className="text-xs flex justify-between items-center mt-1">
                              <span className="text-gray-700">
                                {employee ? employee.name : `Employee ${assignment.employee_id}`}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveAssignment(shift.shift_id, assignment.employee_id);
                                }}
                                className="text-red-500 hover:text-red-700 text-xs"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex gap-4 mb-8">
          <button
            onClick={() => generateShifts(14)}
            disabled={scheduleLoading}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-green-300"
          >
            Generate Next 2 Weeks
          </button>
        </div>

        {/* Manual Shift Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Add Manual Shift</h3>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input type="date" name="date" required 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                <input type="time" name="start_time" required 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                <input type="time" name="end_time" required 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                <select name="department_id" required 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md">
                  <option value="">Select Department</option>
                  {departments.map(dept => (
                    <option key={dept.department_id} value={dept.department_id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Shift Label</label>
                <input type="text" name="label" placeholder="Optional" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
            </div>
            <button
              type="submit"
              disabled={scheduleLoading}
              className="mt-4 w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-blue-300"
            >
              Add Shift
            </button>
          </form>
        </div>
      </div>

      {/* Employee Assignment Modal */}
      {assignmentModalOpen && selectedShift && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                Assign Employee to Shift
              </h3>
              <button
                onClick={() => {
                  setAssignmentModalOpen(false);
                  setSelectedShift(null);
                  setSelectedTaskIds([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                {format(new Date(selectedShift.date), 'MMMM d, yyyy')}
              </p>
              <p className="text-sm text-gray-600">
                {selectedShift.start_time} - {selectedShift.end_time}
              </p>
              {selectedShift.label && (
                <p className="text-sm text-gray-600">
                  {selectedShift.label}
                </p>
              )}
            </div>

            {/* Employee Selection Section */}
            <div>
              <h4 className="font-medium mb-2">Select Employee</h4>
              <div className="max-h-60 overflow-y-auto">
                {employees.length > 0 ? (
                  employees.map(employee => (
                    <button
                      key={employee.employee_id}
                      onClick={() => handleAssignEmployee(employee.employee_id)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded mb-1"
                    >
                      <div className="font-medium">{employee.name}</div>
                      <div className="text-sm text-gray-500">
                        Department: {departments.find(d => d.department_id === employee.department_id)?.name || 'Unknown'} (ID: {employee.department_id})
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-4">
                    No employees found in the system
                  </p>
                )}
              </div>
            </div>

            {/* Task Assignment Section */}
            <div className="mt-6 border-t pt-4">
              <h4 className="font-medium mb-2">Assign Tasks to Shift</h4>
              <div className="max-h-40 overflow-y-auto">
                {tasks.length > 0 ? (
                  tasks.map(task => (
                    <label key={task.task_id} className="flex items-start p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.includes(task.task_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTaskIds(prev => [...prev, task.task_id]);
                          } else {
                            setSelectedTaskIds(prev => prev.filter(id => id !== task.task_id));
                          }
                        }}
                        className="mt-1 mr-2"
                      />
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-gray-500">{task.description}</div>
                        {task.due_date && (
                          <div className="text-xs text-gray-400">
                            Due: {format(new Date(task.due_date), 'MMM d, yyyy')}
                          </div>
                        )}
                      </div>
                    </label>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-2">
                    No unassigned tasks available
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftPatternConfigurator;