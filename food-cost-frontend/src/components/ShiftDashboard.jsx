import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfWeek } from 'date-fns';
import { api } from '../utils/auth';

// lightweight JWT decoder to avoid bundler issues with jwt-decode package
function decodeJwt(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return {};
    const payload = parts[1];
    // base64url -> base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // pad base64 string
    const pad = base64.length % 4;
    const padded = base64 + (pad ? '='.repeat(4 - pad) : '');
    const decoded = window.atob(padded);
    // handle UTF-8
    try {
      return JSON.parse(decodeURIComponent(escape(decoded)));
    } catch (e) {
      return JSON.parse(decoded);
    }
  } catch (e) {
    console.error('decodeJwt failed', e);
    return {};
  }
}

function initials(name = ''){
  return name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
}

const ShiftDashboard = () => {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [employee, setEmployee] = useState({ employee_id: null, name: '' });

  const getEmployeeFromToken = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }
    try {
      const decoded = decodeJwt(token);
      // decoded may contain employee_id and name depending on backend
      return {
        employee_id: decoded.employee_id ?? decoded.sub ?? decoded.id,
        name: decoded.name || decoded.user_name || ''
      };
    } catch (err) {
      console.error('Error decoding token:', err);
      throw new Error('Invalid authentication token');
    }
  };

  const fetchEmployeeShifts = async () => {
    try {
      setLoading(true);
      setError(null);

      const emp = getEmployeeFromToken();
      setEmployee(emp);
      const startDate = format(startOfWeek(new Date()), 'yyyy-MM-dd');
      console.log('Requesting /api/shifts/weekly', { start_date: startDate, employee_id: emp.employee_id });
      const response = await api.get('/api/shifts/weekly', {
        params: {
          start_date: startDate,
          employee_id: emp.employee_id
        }
      });

      const allShifts = response.data.shifts || [];
      const employeeShifts = allShifts.filter(shift =>
        (shift.assignments || []).some(assignment => Number(assignment.employee_id) === Number(emp.employee_id))
      );

      employeeShifts.sort((a,b) => {
        if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
        if (!a.start_time || !b.start_time) return 0;
        return a.start_time.localeCompare(b.start_time);
      });

      setShifts(employeeShifts);
    } catch (err) {
      console.error('Failed fetching shifts:', err);
      setError('Failed to fetch your shifts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeeShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextShift = useMemo(() => (shifts && shifts.length > 0 ? shifts[0] : null), [shifts]);

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-lg">{initials(employee.name || '') || 'ME'}</div>
          <div>
            <div className="text-sm text-gray-500">Welcome back</div>
            <div className="text-2xl font-bold">{employee.name || 'Your Shifts'}</div>
            <div className="text-xs text-gray-400">This week</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={fetchEmployeeShifts} className="px-4 py-2 bg-white border rounded shadow-sm hover:shadow-md transition">Refresh</button>
          <a href="/shifts/manager" className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition">Manager</a>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-6 bg-gray-200 rounded w-1/2 mb-3 animate-pulse" />
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2 animate-pulse" />
              <div className="h-3 bg-gray-200 rounded w-2/3 mt-2 animate-pulse" />
            </div>
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m2 0a2 2 0 110 4H7a2 2 0 110-4h10z" /></svg>
          <div className="text-lg font-medium">No upcoming shifts</div>
          <div className="text-sm mt-1">You're all clear for the coming week. Check back later or contact your manager.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {nextShift && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-white to-blue-50 border border-blue-100 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500">Next shift</div>
                  <div className="text-lg font-semibold">{format(new Date(nextShift.date), 'EEEE, MMM d')}</div>
                  <div className="text-sm text-gray-600">{nextShift.start_time} — {nextShift.end_time} • Dept: {nextShift.department_id}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Label</div>
                  <div className="font-medium">{nextShift.label || 'Shift'}</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shifts.map(shift => (
              <div key={shift.shift_id} className="p-4 rounded-lg border border-gray-100 bg-white shadow-sm hover:shadow-md transition">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-semibold">{initials( employee.name || '' )}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{shift.label || 'Shift'}</div>
                      <div className="text-xs text-gray-400">{format(new Date(shift.date), 'MMM d')}</div>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">{shift.start_time} — {shift.end_time}</div>
                    <div className="text-xs text-gray-400 mt-2">Department: {shift.department_id}</div>
                  </div>
                </div>

                {(shift.assignments && shift.assignments.length > 0) ? (
                  <div className="mt-3 text-sm text-gray-700">
                    Assigned: {shift.assignments.map(a => a.employee_id).join(', ')}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-red-500">You are not assigned to this shift</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftDashboard;
