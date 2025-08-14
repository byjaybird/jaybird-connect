import React, { useEffect, useState, useMemo } from 'react';
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

function initials(name){
  // ensure we never call .split on null/undefined
  const s = String(name || '').trim();
  if (!s) return '';
  return s.split(/\s+/).map(part => part[0]).slice(0,2).join('').toUpperCase();
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

  const endDate = useMemo(() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 6);
    return d;
  }, [startDate]);

  // helper to show employee name by id
  function nameForEmployee(id){
    const e = employees.find(emp => Number(emp.employee_id) === Number(id));
    return e ? e.name : id;
  }

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button aria-label="previous-week" className="w-10 h-10 flex items-center justify-center rounded-full bg-white border shadow-sm hover:shadow-md transition" onClick={() => adjustWeek(-7)}>◀</button>
          <div>
            <div className="text-sm text-gray-500">Week</div>
            <div className="text-lg font-semibold">{startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — {endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
            <div className="text-xs text-gray-400">Starting {formatDate(startDate)}</div>
          </div>
          <button aria-label="next-week" className="w-10 h-10 flex items-center justify-center rounded-full bg-white border shadow-sm hover:shadow-md transition" onClick={() => adjustWeek(7)}>▶</button>
        </div>

        <div className="flex items-center gap-3">
          <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="p-2 border rounded bg-white">
            <option value="">All Departments</option>
            {/* Departments could be loaded dynamically later */}
          </select>

          <button className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition" onClick={handleGenerateWeek} disabled={loading}>Generate Week</button>
          <button className="px-4 py-2 bg-white border rounded shadow-sm hover:shadow-md transition" onClick={fetchShifts}>Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
          {Array.from({length:7}).map((_,i) => (
            <div key={i} className="p-4 rounded-lg bg-gradient-to-br from-white to-gray-50 border shadow-sm animate-pulse h-48" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
          {weekDates.map(d => {
            const key = formatDate(d);
            const dayShifts = grouped[key] || [];
            return (
              <div key={key} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition min-h-[160px] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                    <div className="text-xs text-gray-400">{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                  </div>
                  <div className="text-xs text-gray-500">{dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}</div>
                </div>

                <div className="flex-1 space-y-3 overflow-auto">
                  {dayShifts.length === 0 ? (
                    <div className="flex items-center justify-center flex-col text-gray-400 p-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m2 0a2 2 0 110 4H7a2 2 0 110-4h10z" /></svg>
                      <div className="text-sm">No shifts</div>
                    </div>
                  ) : (
                    dayShifts.map(shift => (
                      <div key={shift.shift_id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{shift.label}</div>
                          <div className="text-xs text-gray-500">{shift.start_time || ''} — {shift.end_time || ''}</div>
                          <div className="text-xs text-gray-400 mt-1">Dept: {shift.department_id}</div>

                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex items-center gap-2">
                              {shift.assignments && shift.assignments.length > 0 ? (
                                shift.assignments.map(a => (
                                  <div key={a.employee_id} className="flex items-center gap-2 text-xs text-gray-700">
                                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-semibold">{initials(nameForEmployee(a.employee_id))}</div>
                                    <div>{nameForEmployee(a.employee_id)}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-red-500">Unassigned</div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <select value={assigning[shift.shift_id] || ''} onChange={e => setAssigning(prev => ({ ...prev, [shift.shift_id]: e.target.value }))} className="p-2 border rounded bg-white text-sm w-44">
                            <option value="">Select Employee</option>
                            {employees.map(emp => (
                              <option key={emp.employee_id} value={emp.employee_id}>{emp.name} ({emp.email})</option>
                            ))}
                          </select>
                          <button className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition" onClick={() => handleAssign(shift.shift_id)}>Assign</button>
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
