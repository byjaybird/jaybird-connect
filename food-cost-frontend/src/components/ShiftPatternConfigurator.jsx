import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays } from 'date-fns';
import { checkAuthStatus, api } from '../utils/auth';

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
        const tasksResponse = await api.get('/api/tasks/unassigned');
        setTasks(tasksResponse.data);
        
        // Fetch departments
        const deptResponse = await api.get('/api/departments');
        setDepartments(deptResponse.data);

        // Fetch patterns
        const patternsResponse = await api.get('/api/shifts/patterns');
        setPatterns(patternsResponse.data);

        // Fetch employees from users endpoint
        const employeesResponse = await api.get('/api/users');
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

      // Assign employee to shift
      await api.post(`/api/shifts/${selectedShift.shift_id}/assign`, { employee_id: employeeId });

      // If there are selected tasks, assign them to the shift as well
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

  // Fetch patterns function
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

      // Format the data for the API - send only the time portion
      const formattedPattern = {
        ...updatedPattern,
        start_time: `${updatedPattern.start_time}:00`,
        end_time: `${updatedPattern.end_time}:00`
      };

      await api.put(`/api/shifts/patterns/${editingPattern}`, formattedPattern);
      
      // Refresh patterns
      await fetchPatterns();
      
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
      
      // Format the data for the API - send only the time portion
      const formattedPattern = {
        ...newPattern,
        start_time: `${newPattern.start_time}:00`,
        end_time: `${newPattern.end_time}:00`
      };

      await api.post('/api/shifts/patterns', formattedPattern);
      
      // Refresh patterns after creating new one
      await fetchPatterns();
      
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
      await api.delete(`/api/shifts/patterns/${patternId}`);
      
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
      const response = await api.get('/api/shifts/weekly', {
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

  // ... Rest of the component render code remains the same ...
};

export default ShiftPatternConfigurator;