import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
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
  const [pattern, setPattern] = useState({
    days_of_week: [],
    number_of_shifts: 1
  });

  const queryClient = useQueryClient();

  // Query to fetch existing patterns
  const { data: patterns, isLoading, isError } = useQuery(['patterns'], async () => {
    const response = await axios.get(`${API_URL}/shifts/patterns`);
    return response.data;
  });

  const createPatternMutation = useMutation(
    (newPattern) => {
      return axios.post(`${API_URL}/shifts/patterns`, newPattern);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['patterns']);
        setPattern({ days_of_week: [], number_of_shifts: 1 });
      }
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pattern.label && pattern.start_time && pattern.end_time && pattern.department_id) {
      createPatternMutation.mutate(pattern);
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
        {isError && <div className="text-red-600">Error loading patterns</div>}
        {patterns && patterns.length === 0 && <div>No patterns defined yet</div>}
        {patterns && patterns.length > 0 && (
          <div className="grid gap-4">
            {patterns.map(pattern => (
              <div key={pattern.pattern_id} className="border p-4 rounded-lg bg-white shadow">
                <h4 className="font-semibold">{pattern.label}</h4>
                <p>Days: {pattern.days_of_week.join(', ')}</p>
                <p>Time: {pattern.start_time} - {pattern.end_time}</p>
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
          <input
            type="number"
            id="department_id"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={pattern.department_id || ''}
            onChange={e => setPattern(prev => ({ ...prev, department_id: Number(e.target.value) }))}
            required
          />
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
          disabled={createPatternMutation.isLoading}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed"
        >
          {createPatternMutation.isLoading ? 'Creating...' : 'Create Pattern'}
        </button>
      </form>

      {createPatternMutation.isError && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-md">
          Failed to create pattern. Please try again.
        </div>
      )}
    </div>
  );
};

export default ShiftPatternConfigurator;