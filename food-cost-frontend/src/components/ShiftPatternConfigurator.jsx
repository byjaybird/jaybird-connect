import React, { useState, useEffect } from 'react';
import { checkAuthStatus, api } from '../utils/auth';
import { format, startOfWeek } from 'date-fns';

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
  // Core state
  const [departments, setDepartments] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pattern, setPattern] = useState({
    days_of_week: [],
    number_of_shifts: 1,
    label: '',
    start_time: '',
    end_time: '',
    department_id: ''
  });
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

  // Debug state values
  const debugState = () => {
    console.log('Current state values:', {
      departmentsLength: departments?.length,
      patternsLength: patterns?.length,
      isLoading,
      hasError: !!error,
      employeesLength: employees?.length,
      shiftsLength: shifts?.length
    });
  };

  // Utility function to safely format time strings
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    try {
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

  // Initial data fetch and weekly shifts
  useEffect(() => {
    let mounted = true;
    
    const fetchAllData = async () => {
      try {
        // Check auth status first
        try {
          await checkAuthStatus();
        } catch (authError) {
          console.error('ShiftPatternConfigurator: Authentication check failed');
          window.location.href = '/login';
          return;
        }

        // Fetch all data in parallel
        const [
          tasksResponse,
          deptResponse,
          patternsResponse,
          employeesResponse,
          shiftsResponse
        ] = await Promise.all([
          api.get('/api/tasks/unassigned'),
          api.get('/api/departments'),
          api.get('/api/shifts/patterns'),
          api.get('/api/users'),
          api.get('/api/shifts/weekly', {
            params: {
              start_date: format(selectedWeekStart, 'yyyy-MM-dd')
            }
          })
        ]);

        if (!mounted) return;

        // Update all state at once to reduce renders
        setTasks(tasksResponse.data);
        setDepartments(deptResponse.data);
        setPatterns(patternsResponse.data);
        setEmployees(employeesResponse.data.filter(emp => emp.active));
        setShifts(shiftsResponse.data.shifts || []);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        console.error('Error fetching data:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load data');
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchAllData();

    return () => {
      mounted = false;
    };
  }, [selectedWeekStart]); // Only re-run if week changes

  // Pattern management functions
  const fetchPatterns = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/shifts/patterns');
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
      const formattedPattern = {
        ...updatedPattern,
        start_time: `${updatedPattern.start_time}:00`,
        end_time: `${updatedPattern.end_time}:00`
      };

      await api.put(`/api/shifts/patterns/${editingPattern}`, formattedPattern);
      await fetchPatterns();
      
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
      const formattedPattern = {
        ...newPattern,
        start_time: `${newPattern.start_time}:00`,
        end_time: `${newPattern.end_time}:00`
      };

      await api.post('/api/shifts/patterns', formattedPattern);
      await fetchPatterns();
      
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
      await api.delete(`/api/shifts/patterns/${patternId}`);
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
  const handleAssignEmployee = async (employeeId) => {
    try {
      console.log('Assigning employee:', employeeId, 'to shift:', selectedShift);
      setScheduleLoading(true);

      await api.post(`/api/shifts/${selectedShift.shift_id}/assign`, { employee_id: employeeId });

      if (selectedTaskIds.length > 0) {
        await api.post(`/api/shifts/${selectedShift.shift_id}/tasks`, { task_ids: selectedTaskIds });
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
      await api.delete(`/api/shifts/${shiftId}/assign/${employeeId}`);
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      console.error('Error removing assignment:', err);
      setScheduleError('Failed to remove employee from shift');
    } finally {
      setScheduleLoading(false);
    }
  };

  const fetchWeeklyShifts = async (startDate) => {
    try {
      setScheduleLoading(true);
      setScheduleError(null);
      const response = await api.get('/api/shifts/weekly', {
        params: {
          start_date: format(startDate, 'yyyy-MM-dd')
        }
      });
      
      const shiftsData = response.data.shifts || [];
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
      await api.post('/api/shifts/manual', shiftData);
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
      
      await api.post('/api/shifts/generate', { days_ahead: daysAhead });
      await fetchWeeklyShifts(selectedWeekStart);
    } catch (err) {
      console.error('Error generating shifts:', err);
      setScheduleError(err.response?.data?.message || 'Failed to generate shifts: ' + err.message);
    } finally {
      setScheduleLoading(false);
    }
  };

  // Debug logging only in development
  if (process.env.NODE_ENV === 'development') {
    useEffect(() => {
      console.log('Component State:', {
        departments,
        patterns,
        isLoading,
        error,
        employees,
        shifts
      });
    }, [departments, patterns, isLoading, error, employees, shifts]);
  }

  // Render loading state
  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        Loading shift patterns...
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
        Error: {error}
      </div>
    );
  }

  // Main render
  return (
    <div className="shift-pattern-configurator" style={{padding: '20px'}}>
      <h2>Shift Pattern Configuration</h2>
      
      {/* Existing Patterns */}
      <div className="patterns-list">
        <h3>Existing Patterns</h3>
        {patterns.map((p) => (
          <div key={p.pattern_id} className="pattern-item">
            <h4>{p.label}</h4>
            <p>Department: {departments.find(d => d.id === p.department_id)?.name}</p>
            <p>Days: {Array.isArray(p.days_of_week) ? p.days_of_week.join(', ') : p.days_of_week}</p>
            <p>Time: {formatTime(p.start_time)} - {formatTime(p.end_time)}</p>
            <button onClick={() => handleEdit(p)}>Edit</button>
            <button onClick={() => handleDelete(p.pattern_id)}>Delete</button>
          </div>
        ))}
      </div>

      {/* Pattern Form */}
      <form onSubmit={handleSubmit} className="pattern-form">
        <h3>{editingPattern ? 'Edit Pattern' : 'Create New Pattern'}</h3>
        
        <div>
          <label>Label:</label>
          <input
            type="text"
            value={pattern.label}
            onChange={(e) => setPattern({...pattern, label: e.target.value})}
            required
          />
        </div>

        <div>
          <label>Department:</label>
          <select
            value={pattern.department_id}
            onChange={(e) => setPattern({...pattern, department_id: e.target.value})}
            required
          >
            <option value="">Select Department</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Days of Week:</label>
          <div className="days-selector">
            {DAYS_OF_WEEK.map((day) => (
              <label key={day}>
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

        <div>
          <label>Start Time:</label>
          <input
            type="time"
            value={pattern.start_time}
            onChange={(e) => setPattern({...pattern, start_time: e.target.value})}
            required
          />
        </div>

        <div>
          <label>End Time:</label>
          <input
            type="time"
            value={pattern.end_time}
            onChange={(e) => setPattern({...pattern, end_time: e.target.value})}
            required
          />
        </div>

        <button type="submit" disabled={isCreating}>
          {isCreating ? 'Saving...' : (editingPattern ? 'Update Pattern' : 'Create Pattern')}
        </button>

        {editingPattern && (
          <button
            type="button"
            onClick={() => {
              setEditingPattern(null);
              setPattern({
                days_of_week: [],
                number_of_shifts: 1,
                label: '',
                start_time: '',
                end_time: '',
                department_id: ''
              });
            }}
          >
            Cancel Edit
          </button>
        )}
      </form>
    </div>
  );
};

export default ShiftPatternConfigurator;