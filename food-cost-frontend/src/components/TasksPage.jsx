// Updated TasksPage.jsx
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { checkAuthStatus, api } from '../utils/auth';
import { canEdit } from '../utils/permissions';

const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

function getLocalUser() {
  try { const raw = localStorage.getItem('appUser'); if (!raw) return null; return JSON.parse(raw); } catch (e) { return null; }
}

function TasksPage({ user }) {
  const localUser = user || getLocalUser();
  const [patterns, setPatterns] = useState([]);
  const [isCreatingPattern, setIsCreatingPattern] = useState(false);
  const [isEditingPattern, setIsEditingPattern] = useState(false);
  const [currentPattern, setCurrentPattern] = useState({
    title: '', description: '', priority: 'medium',
    department_id: localUser?.department_id || '',
    week_number: 1, days_of_week: [], frequency: 'weekly'
  });
  const [generateDays, setGenerateDays] = useState(14);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState(null);

  const allowedTasksEdit = canEdit(localUser, 'tasks');
  const allowedPatternEdit = canEdit(localUser, 'shift_patterns');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return (window.location.href = '/login');
        const [patternsRes, deptsRes, tasksRes] = await Promise.all([
          api.get('/api/tasks/patterns'),
          api.get('/api/departments'),
          api.get('/api/tasks/department')
        ]);
        setPatterns(patternsRes.data);
        setDepartments(deptsRes.data);
        setTasks(tasksRes.data);
        setLoading(false);
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          window.location.href = '/login';
        } else {
          setError(err.response?.data?.message || err.message);
        }
      }
    };
    if (localUser) fetchData();
  }, [localUser]);

  const handleEditPattern = (pattern) => {
    if (!allowedPatternEdit) return alert('You do not have permission to edit patterns');
    setCurrentPattern({ ...pattern, department_id: pattern.department_id || localUser?.department_id });
    setIsEditingPattern(true);
    setIsCreatingPattern(true);
  };

  const handleDeletePattern = async (id) => {
    if (!allowedPatternEdit) return alert('You do not have permission to delete patterns');
    if (!window.confirm('Delete this pattern?')) return;
    try {
      await api.delete(`/api/tasks/patterns/${id}`);
      setPatterns(prev => prev.filter(p => p.pattern_id !== id));
    } catch (err) {
      alert(`Failed to delete pattern: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleSubmitPattern = async (e) => {
    e.preventDefault();
    if (!currentPattern.days_of_week.length) return alert('Select at least one day');
    if (!allowedPatternEdit) return alert('You do not have permission to save patterns');
    const formData = {
      ...currentPattern,
      department_id: Number(currentPattern.department_id),
      days_of_week: currentPattern.days_of_week.map(Number).sort()
    };
    try {
      const res = isEditingPattern
        ? await api.put(`/api/tasks/patterns/${currentPattern.pattern_id}`, formData)
        : await api.post('/api/tasks/patterns', formData);

      setPatterns(prev =>
        isEditingPattern
          ? prev.map(p => (p.pattern_id === currentPattern.pattern_id ? res.data : p))
          : [...prev, res.data]
      );
      resetPatternForm();
    } catch (err) {
      alert(`Failed to save pattern: ${err.response?.data?.error || err.message}`);
    }
  };

  const resetPatternForm = () => {
    setCurrentPattern({
      title: '', description: '', priority: 'medium',
      department_id: localUser.department_id || '',
      week_number: 1, days_of_week: [], frequency: 'weekly'
    });
    setIsCreatingPattern(false);
    setIsEditingPattern(false);
  };

  const handleGenerateTasks = async () => {
    if (!allowedTasksEdit) return alert('You do not have permission to generate tasks');
    try {
      const token = localStorage.getItem('token');
      if (!token) return (window.location.href = '/login');
      setLoading(true);
      const res = await api.post('/api/tasks/generate', { days_ahead: generateDays });
      alert(res.data.message || `Successfully generated ${res.data.length} tasks for your department`);
      const updated = await api.get('/api/tasks/department');
      setTasks(updated.data);
    } catch (err) {
      alert(`Failed to generate tasks: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!localUser || loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Task Patterns</h1>
        <div className="space-x-4">
          {!isEditingPattern && (
            <button onClick={() => setIsCreatingPattern(!isCreatingPattern)} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600" disabled={!allowedPatternEdit}>
              {isCreatingPattern ? 'Cancel' : 'Create Pattern'}
            </button>
          )}
          <select value={generateDays} onChange={(e) => setGenerateDays(Number(e.target.value))} className="px-2 py-1 border rounded">
            {[7, 14, 21, 28].map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
          <button onClick={handleGenerateTasks} className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600" disabled={!allowedTasksEdit}>
            Generate Tasks
          </button>
        </div>
      </div>

      {isCreatingPattern && (
        <form onSubmit={handleSubmitPattern} className="mb-8 bg-white p-6 rounded-lg shadow space-y-4">
          <h2 className="text-xl font-semibold">{isEditingPattern ? 'Edit' : 'Create'} Task Pattern</h2>
          <input value={currentPattern.title} onChange={e => setCurrentPattern(p => ({ ...p, title: e.target.value }))} placeholder="Title" className="w-full px-3 py-2 border rounded" required />
          <textarea value={currentPattern.description} onChange={e => setCurrentPattern(p => ({ ...p, description: e.target.value }))} placeholder="Description" className="w-full px-3 py-2 border rounded" rows="3" />
          <select value={currentPattern.frequency} onChange={e => setCurrentPattern(p => ({ ...p, frequency: e.target.value }))} className="w-full px-3 py-2 border rounded">
            <option value="weekly">Weekly</option>
            <option value="bi-weekly">Bi-weekly</option>
          </select>
          {currentPattern.frequency === 'bi-weekly' && (
            <select value={currentPattern.week_number} onChange={e => setCurrentPattern(p => ({ ...p, week_number: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded">
              <option value={1}>Week 1</option>
              <option value={2}>Week 2</option>
            </select>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {DAYS_OF_WEEK.map((day, i) => (
              <label key={day} className="flex items-center gap-2">
                <input type="checkbox" checked={currentPattern.days_of_week.includes(i)}
                  onChange={e => setCurrentPattern(p => ({
                    ...p,
                    days_of_week: e.target.checked
                      ? [...p.days_of_week, i]
                      : p.days_of_week.filter(d => d !== i)
                  }))} />
                {day}
              </label>
            ))}
          </div>
          <select value={currentPattern.priority} onChange={e => setCurrentPattern(p => ({ ...p, priority: e.target.value }))} className="w-full px-3 py-2 border rounded">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <select value={currentPattern.department_id} onChange={e => setCurrentPattern(p => ({ ...p, department_id: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded" required>
            <option value="">Select Department</option>
            {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
          </select>
          <div className="flex justify-end">
            <button type="submit" className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600" disabled={!allowedPatternEdit}>
              {isEditingPattern ? 'Save Changes' : 'Create Pattern'}
            </button>
          </div>
        </form>
      )}

      <h2 className="text-xl font-semibold mb-4">Existing Patterns</h2>
      <div className="grid gap-4 mb-8">
        {patterns.map(p => (
          <div key={p.pattern_id} className="border p-4 rounded bg-white shadow">
            <div className="flex justify-between items-start">
              <h3 className="font-semibold">{p.title}</h3>
              <div className="flex gap-2">
                <button onClick={() => handleEditPattern(p)} className="text-blue-600 hover:text-blue-800" disabled={!allowedPatternEdit}>Edit</button>
                <button onClick={() => handleDeletePattern(p.pattern_id)} className="text-red-600 hover:text-red-800" disabled={!allowedPatternEdit}>Delete</button>
              </div>
            </div>
            <p className="text-gray-600">{p.description}</p>
            <p className="text-sm mt-1">
              {p.frequency === 'bi-weekly' && `Week ${p.week_number}, `}
              {p.days_of_week.map(i => DAYS_OF_WEEK[i]).join(', ')} | Priority: {p.priority}
            </p>
            <p className="text-sm">Department: {departments.find(d => d.department_id === p.department_id)?.name}</p>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-4">Current Tasks</h2>
      <div className="grid gap-4">
        {tasks.map(task => (
          <div key={task.task_id} className="border p-4 rounded bg-white shadow">
            <div className="flex justify-between items-start">
              <h3 className="font-semibold">{task.title}</h3>
              <span className={`px-2 py-1 rounded text-sm ${
                task.status === 'completed' ? 'bg-green-100 text-green-800' :
                task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {task.status}
              </span>
            </div>
            <p className="text-gray-600">{task.description}</p>
            <p className="text-sm mt-1">Due: {format(new Date(task.due_date), 'MMM d, yyyy')}</p>
            <p className="text-sm">Priority: {task.priority}</p>
            <p className="text-sm">Department: {departments.find(d => d.department_id === task.department_id)?.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TasksPage;