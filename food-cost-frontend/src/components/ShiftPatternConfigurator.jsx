import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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

  const createPatternMutation = useMutation(
    (newPattern) => {
      // This would call your API endpoint to create the pattern
      return Promise.resolve(newPattern);
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
    <div className="shift-pattern-configurator">
      <h2>Configure Shift Pattern</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="label">Pattern Label</label>
          <input
            type="text"
            id="label"
            value={pattern.label || ''}
            onChange={e => setPattern(prev => ({ ...prev, label: e.target.value }))}
            required
          />
        </div>

        <div className="form-group">
          <label>Days of Week</label>
          <div className="days-selector">
            {DAYS_OF_WEEK.map(day => (
              <label key={day} className="day-checkbox">
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

        <div className="form-group">
          <label htmlFor="start_time">Start Time</label>
          <input
            type="time"
            id="start_time"
            value={pattern.start_time || ''}
            onChange={e => setPattern(prev => ({ ...prev, start_time: e.target.value }))}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="end_time">End Time</label>
          <input
            type="time"
            id="end_time"
            value={pattern.end_time || ''}
            onChange={e => setPattern(prev => ({ ...prev, end_time: e.target.value }))}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="department_id">Department</label>
          <input
            type="number"
            id="department_id"
            value={pattern.department_id || ''}
            onChange={e => setPattern(prev => ({ ...prev, department_id: Number(e.target.value) }))}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="number_of_shifts">Number of Shifts</label>
          <input
            type="number"
            id="number_of_shifts"
            min="1"
            value={pattern.number_of_shifts}
            onChange={e => setPattern(prev => ({ ...prev, number_of_shifts: Number(e.target.value) }))}
            required
          />
        </div>

        <button
          type="submit"
          disabled={createPatternMutation.isLoading}
        >
          {createPatternMutation.isLoading ? 'Creating...' : 'Create Pattern'}
        </button>
      </form>

      {createPatternMutation.isError && (
        <div className="error-message">
          Failed to create pattern. Please try again.
        </div>
      )}
    </div>
  );
};

export default ShiftPatternConfigurator;