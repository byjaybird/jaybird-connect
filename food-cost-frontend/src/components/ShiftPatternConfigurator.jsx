import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

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

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/departments`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        setDepartments(response.data);
      } catch (err) {
        console.error('Error fetching departments:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load departments');
      }
    };

    const fetchPatterns = async () => {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('token');
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

    fetchDepartments();
    fetchPatterns();
  }, []);

  const handleUpdatePattern = async (updatedPattern) => {
    try {
      setIsCreating(true);
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/shifts/patterns/${editingPattern}`, updatedPattern, {
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
      await axios.post(`${API_URL}/shifts/patterns`, newPattern, {
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
    
    // Format times for input fields (extract HH:mm from ISO string)
    const startTime = new Date(patternToEdit.start_time).toTimeString().slice(0, 5);
    const endTime = new Date(patternToEdit.end_time).toTimeString().slice(0, 5);
    
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
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/shifts/patterns/${patternId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
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
                <p>Time: {new Date(pattern.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(pattern.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
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
    </div>
  );
};

export default ShiftPatternConfigurator;