import React, { useEffect, useState } from 'react';
import { api } from '../utils/auth';

function startOfWeek(date, weekStartsOn = 0) { // 0=Sunday,1=Monday
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < weekStartsOn) ? -7 + (weekStartsOn - day) : weekStartsOn - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function formatDate(date) {
  const d = new Date(date);
  return d.toISOString().slice(0,10);
}

export default function ShiftManager({ weekStartsOn = 1 }) {
  const [startDate, setStartDate] = useState(() => startOfWeek(new Date(), weekStartsOn));
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [assigning, setAssigning] = useState({}); // { shiftId: employeeId }
  const [departmentFilter, setDepartmentFilter] = useState('');

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, departmentFilter]);

  async function fetchEmployees(){
    try{
      const res = await api.get('/api/users');
      setEmployees(res.data || []);
    }catch(e){
      console.error('Failed to load employees', e.response || e);
    }
  }

  async function fetchShifts(){
    setLoading(true);
    try{
      const sd = formatDate(startDate);
      // Debug: ensure token exists in localStorage (helps track 401 causes)
      console.log('fetchShifts - token present:', !!localStorage.getItem('token'));
      const params = { start_date: sd };
      if (departmentFilter) params.department_id = departmentFilter;
      const res = await api.get('/api/shifts/weekly', { params });
      setShifts(res.data.shifts || []);
    }catch(e){
      console.error('Failed to load shifts', e.response || e);
    } finally {
      setLoading(false);
    }
  }

  function adjustWeek(deltaDays){
    const next = new Date(startDate);
    next.setDate(next.getDate() + deltaDays);
    setStartDate(startOfWeek(next, weekStartsOn));
  }

  async function handleGenerateWeek(){
    if(!confirm('Generate shifts for this week from patterns?')) return;
    setLoading(true);
    try{
      const sd = formatDate(startDate);
      const res = await api.post('/api/shifts/generate', { start_date: sd, days_ahead: 7 });
      const data = res.data;
      await fetchShifts();
      alert(data.message || 'Generate completed');
    }catch(e){
      console.error('Generate failed', e.response || e);
      alert('Generate failed');
    }finally{ setLoading(false); }
  }

  async function handleAssign(shiftId){
    const employeeId = assigning[shiftId];
    if(!employeeId){ alert('Select employee first'); return; }
    try{
      const res = await api.post(`/api/shifts/${shiftId}/assign`, { employee_id: Number(employeeId) });
      await fetchShifts();
      setAssigning(prev => ({ ...prev, [shiftId]: '' }));
    }catch(e){
      console.error('Assign failed', e.response || e);
      alert(e.response?.data?.error || 'Assign failed');
    }
  }

  function groupByDate(list){
    const map = {};
    (list || []).forEach(s => {
      const dateKey = s.date ? s.date : s['date'];
      map[dateKey] = map[dateKey] || [];
      map[dateKey].push(s);
    });
    return map;
  }

  const grouped = groupByDate(shifts);

  // Compute the seven days for the currently selected week
  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    d.setHours(0,0,0,0);
    return d;
  });

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 bg-gray-200 rounded" onClick={() => adjustWeek(-7)}>Prev</button>
          <div className="font-semibold">Week of {formatDate(startDate)}</div>
          <button className="px-3 py-1 bg-gray-200 rounded" onClick={() => adjustWeek(7)}>Next</button>
        </div>
        <div className="flex items-center gap-2">
          <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="p-1 border rounded">
            <option value="">All Departments</option>
            {/* Departments could be loaded dynamically later */}
          </select>
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={handleGenerateWeek} disabled={loading}>Generate Week</button>
          <button className="px-3 py-1 bg-gray-100 rounded" onClick={fetchShifts}>Refresh</button>
        </div>
      </div>

      {loading ? <div>Loading...</div> : (
        // Week grid: 7 equal columns, one per day
        <div className="grid grid-cols-7 gap-4">
          {weekDates.map(d => {
            const key = formatDate(d);
            const dayShifts = grouped[key] || [];
            return (
              <div key={key} className="bg-white p-2 rounded border">
                <div className="font-semibold mb-2">{d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div className="space-y-2 min-h-[120px]">
                  {dayShifts.length === 0 ? (
                    <div className="text-sm text-gray-400">No shifts</div>
                  ) : (
                    dayShifts.map(shift => (
                      <div key={shift.shift_id} className="p-2 border rounded flex items-center justify-between bg-gray-50">
                        <div>
                          <div className="text-lg">{shift.label} — {shift.start_time ? shift.start_time : ''} - {shift.end_time ? shift.end_time : ''}</div>
                          <div className="text-sm text-gray-500">Dept: {shift.department_id}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="min-w-[140px]">
                            {shift.assignments && shift.assignments.length > 0 ? (
                              <div>{shift.assignments.map(a => a.employee_id).join(', ')}</div>
                            ) : (
                              <div className="text-sm text-red-500">Unassigned</div>
                            )}
                          </div>
                          <select value={assigning[shift.shift_id] || ''} onChange={e => setAssigning(prev => ({ ...prev, [shift.shift_id]: e.target.value }))} className="p-1 border rounded">
                            <option value="">Select Employee</option>
                            {employees.map(emp => (
                              <option key={emp.employee_id} value={emp.employee_id}>{emp.name} ({emp.email})</option>
                            ))}
                          </select>
                          <button className="px-2 py-1 bg-green-600 text-white rounded" onClick={() => handleAssign(shift.shift_id)}>Assign</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
