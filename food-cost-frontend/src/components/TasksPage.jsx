import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { checkAuthStatus, api } from '../utils/auth';

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

function TasksPage({ user }) {
  if (!user) {
    return <div className="p-6">Loading user data...</div>;
  }

  // State for managing task patterns
  const [patterns, setPatterns] = useState([]);
  const [isCreatingPattern, setIsCreatingPattern] = useState(false);
  const [currentPattern, setCurrentPattern] = useState({
    title: '',
    description: '',
    priority: 'medium',
    department_id: user?.department_id || '',
    week_number: 1,
    days_of_week: [],
    frequency: 'weekly'
  });

  // State for managing actual tasks
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      console.log('TasksPage: Initializing with user:', user);
      try {
        // Fetch task patterns
          console.log('TasksPage: Fetching task patterns...');
          const patternsResponse = await api.get('/api/tasks/patterns');
          console.log('TasksPage: Received patterns:', patternsResponse.data);
          setPatterns(patternsResponse.data);

        // Fetch departments
        console.log('TasksPage: Fetching departments...');
        const deptsResponse = await api.get('/api/departments');
        console.log('TasksPage: Received departments:', deptsResponse.data);
        setDepartments(deptsResponse.data);

        // Fetch department tasks
        console.log('TasksPage: Fetching department tasks...');
        const tasksResponse = await api.get('/api/tasks/department');
        console.log('TasksPage: Received tasks:', tasksResponse.data);
        setTasks(tasksResponse.data);

        setLoading(false);
      } catch (err) {
        console.error('TasksPage: Error in fetchInitialData:', err);
        console.error('TasksPage: Error details:', {
          response: err.response?.data,
          status: err.response?.status,
          message: err.message
        });
        
        if (err.response?.status === 401) {
          console.error('TasksPage: Authentication failed, redirecting to login');
          localStorage.removeItem('token'); // Clear invalid token
          window.location.href = '/login';
          return;
        }
        
        setError(err.response?.data?.message || err.message || 'Failed to load initial data');
      }
    };

    fetchInitialData();
  }, [user]);

  const handleCreatePattern = async (e) => {
    e.preventDefault();
    // Validate days of week
    if (currentPattern.days_of_week.length === 0) {
      alert('Please select at least one day of the week');
      return;
    }

    // Ensure department_id is a number
    const formData = {
      ...currentPattern,
      department_id: Number(currentPattern.department_id)
    };
    
    console.log('TasksPage: Creating new task pattern:', formData);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('TasksPage: No auth token found during pattern creation');
        return;
      }
      
      // Log the request configuration
      console.log('TasksPage: Request Configuration:', {
        url: '/api/tasks/patterns',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: formData
      });

      const response = await api.post('/api/tasks/patterns', formData);
  console.log('TasksPage: Pattern creation response:', response.data);
  // Refresh patterns
  const patternsResponse = await api.get('/api/tasks/patterns');
      console.log('TasksPage: Updated patterns list:', patternsResponse.data);
      setPatterns(patternsResponse.data);

      // Reset form
      setCurrentPattern({
        title: '',
        description: '',
        priority: 'medium',
        department_id: user.department_id || '',
        week_number: 1,
        days_of_week: [],
        frequency: 'weekly'
      });
      setIsCreatingPattern(false);
    } catch (err) {
      console.error('TasksPage: Error in handleCreatePattern:', err);
      console.error('TasksPage: Error details:', {
        response: err.response?.data,
        status: err.response?.status,
        message: err.message
      });
      const errorMessage = err.response?.data?.error || err.message;
      console.error('Server error:', err.response?.data);
      
      if (err.response?.status === 401) {
        alert('Your session has expired. Please log in again.');
        window.location.href = '/login';
        return;
      }
      
      alert(`Failed to create pattern: ${errorMessage}`);
    }
  };

  const handleGenerateTasks = async () => {
    console.log('TasksPage: Generating tasks for next 2 weeks...');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('TasksPage: No auth token found during task generation');
        return;
      }

      const generateResponse = await api.post('/api/tasks/generate', { days_ahead: 14 });
      console.log('TasksPage: Generated tasks response:', generateResponse.data);

      // Refresh tasks list
      const tasksResponse = await api.get('/api/tasks/department');
      console.log('TasksPage: Updated tasks list:', tasksResponse.data);
      setTasks(tasksResponse.data);
    } catch (err) {
      console.error('TasksPage: Error in handleGenerateTasks:', err);
      console.error('TasksPage: Error details:', {
        response: err.response?.data,
        status: err.response?.status,
        message: err.message
      });
      alert(`Failed to generate tasks: ${err.response?.data?.error || err.message}`);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600">Error: {error}</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Task Patterns</h1>
        <div className="space-x-4">
          <button
            onClick={() => setIsCreatingPattern(!isCreatingPattern)}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            {isCreatingPattern ? 'Cancel' : 'Create Pattern'}
          </button>
          <button
            onClick={handleGenerateTasks}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Generate Next 2 Weeks
          </button>
        </div>
      </div>

      {/* Pattern Creation Form */}
      {isCreatingPattern && (
        <div className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Create Task Pattern</h2>
          <form onSubmit={handleCreatePattern} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={currentPattern.title}
                onChange={(e) => setCurrentPattern(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={currentPattern.description}
                onChange={(e) => setCurrentPattern(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
                rows="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select
                value={currentPattern.frequency}
                onChange={(e) => setCurrentPattern(prev => ({ ...prev, frequency: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-weekly</option>
              </select>
            </div>

            {currentPattern.frequency === 'bi-weekly' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Week Number</label>
                <select
                  value={currentPattern.week_number}
                  onChange={(e) => setCurrentPattern(prev => ({ ...prev, week_number: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value={1}>Week 1</option>
                  <option value={2}>Week 2</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Days of Week</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {DAYS_OF_WEEK.map((day, index) => (
                  <label key={day} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={currentPattern.days_of_week.includes(index)}
                      onChange={(e) => {
                        setCurrentPattern(prev => ({
                          ...prev,
                          days_of_week: e.target.checked
                            ? [...prev.days_of_week, index]
                            : prev.days_of_week.filter(d => d !== index)
                        }))
                      }}
                      className="rounded border-gray-300"
                    />
                    <span>{day}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={currentPattern.priority}
                  onChange={(e) => setCurrentPattern(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={currentPattern.department_id}
                  onChange={(e) => setCurrentPattern(prev => ({ ...prev, department_id: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded-md"
                  required
                >
                  <option value="">Select Department</option>
                  {departments.map(dept => (
                    <option key={dept.department_id} value={dept.department_id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
              >
                Create Pattern
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Existing Patterns */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Existing Patterns</h2>
        <div className="grid gap-4">
          {patterns.map(pattern => (
            <div key={pattern.pattern_id} className="border p-4 rounded-lg bg-white shadow">
              <div className="flex justify-between items-start">
                <h3 className="font-semibold">{pattern.title}</h3>
                <div className="flex gap-2">
                  <button className="text-blue-600 hover:text-blue-800">Edit</button>
                  <button className="text-red-600 hover:text-red-800">Delete</button>
                </div>
              </div>
              <p className="text-gray-600">{pattern.description}</p>
              <div className="mt-2 text-sm">
                <p>
                  {pattern.frequency === 'bi-weekly' ? `Week ${pattern.week_number}, ` : ''}
                  {pattern.days_of_week.map(day => DAYS_OF_WEEK[day]).join(', ')}
                </p>
                <p>Priority: {pattern.priority}</p>
                <p>Department: {departments.find(d => d.department_id === pattern.department_id)?.name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Generated Tasks */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Current Tasks</h2>
        <div className="grid gap-4">
          {tasks.map(task => (
            <div key={task.task_id} className="border p-4 rounded-lg bg-white shadow">
              <div className="flex justify-between items-start">
                <h3 className="font-semibold">{task.title}</h3>
                <span className={`px-2 py-1 rounded text-sm ${
                  task.status === 'completed' ? 'bg-green-100 text-green-800' :
                  task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {task.status}
                </span>
              </div>
              <p className="text-gray-600">{task.description}</p>
              <div className="mt-2 text-sm">
                <p>Due: {format(new Date(task.due_date), 'MMM d, yyyy h:mm a')}</p>
                <p>Priority: {task.priority}</p>
                <p>Department: {departments.find(d => d.department_id === task.department_id)?.name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TasksPage;