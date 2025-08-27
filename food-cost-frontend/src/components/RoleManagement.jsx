import React, { useState, useEffect } from 'react';
import { api } from '../utils/auth';

const AVAILABLE_PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'menu', label: 'Menu / Items' },
  { key: 'prices', label: 'Prices' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'users', label: 'User Management' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'shift_patterns', label: 'Shift Patterns' },
  { key: 'shift_manager', label: 'Shift Manager' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'receiving', label: 'Receiving' },
  { key: 'inventory_scanner', label: 'Inventory Scanner' },
  { key: 'roles', label: 'Role Management' }
];

const DEFAULT_PERMISSIONS = {
  Admin: AVAILABLE_PAGES.reduce((acc, p) => ({ ...acc, [p.key]: true }), {}),
  Manager: {
    dashboard: true, menu: true, prices: true, inventory: true, users: false,
    shifts: true, shift_patterns: false, shift_manager: true, tasks: true,
    receiving: true, inventory_scanner: false, roles: false
  },
  Employee: {
    dashboard: true, menu: true, prices: false, inventory: false, users: false,
    shifts: true, shift_patterns: false, shift_manager: false, tasks: false,
    receiving: false, inventory_scanner: false, roles: false
  }
};

function readPermissions() {
  try {
    const raw = localStorage.getItem('rolePermissions');
    if (!raw) return DEFAULT_PERMISSIONS;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read rolePermissions', e);
    return DEFAULT_PERMISSIONS;
  }
}

function RoleManagement() {
  const [perms, setPerms] = useState(readPermissions());
  const [saving, setSaving] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(true);

  useEffect(() => {
    // Try to load from server first, fall back to localStorage
    let mounted = true;
    api.get('/api/role-permissions')
      .then((res) => {
        if (!mounted) return;
        if (res.data && Object.keys(res.data).length > 0) {
          setPerms(res.data);
        } else {
          setPerms(readPermissions());
        }
      })
      .catch((err) => {
        console.warn('Failed to load remote permissions, falling back to localStorage', err);
        setPerms(readPermissions());
      })
      .finally(() => {
        setLoadingRemote(false);
      });
    return () => { mounted = false; };
  }, []);

  const toggle = (role, pageKey) => {
    setPerms((p) => ({ ...p, [role]: { ...(p[role] || {}), [pageKey]: !(p[role]?.[pageKey]) } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      // try API save
      await api.post('/api/role-permissions', perms);
      localStorage.setItem('rolePermissions', JSON.stringify(perms));
      alert('Permissions saved to server and locally.');
    } catch (e) {
      console.error('Failed to save to server, saving locally', e);
      try { localStorage.setItem('rolePermissions', JSON.stringify(perms)); } catch (e2) { console.error('Failed to save locally', e2); }
      alert('Failed to save to server; saved locally as fallback.');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    if (!window.confirm('Reset permissions to sensible defaults?')) return;
    setPerms(DEFAULT_PERMISSIONS);
  };

  // Always render roles alphabetically for consistency
  const sortedRoles = Object.keys(perms).sort((a, b) => a.localeCompare(b));

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Role Management</h2>
      {loadingRemote && <div className="mb-4 text-sm text-gray-500">Loading permissions...</div>}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <p className="mb-4">Configure which top-level pages are accessible to each role.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sortedRoles.map((role) => (
            <div key={role} className="border rounded p-4">
              <h3 className="font-semibold mb-3">{role}</h3>
              {AVAILABLE_PAGES.map((p) => (
                <label key={p.key} className="flex items-center space-x-2 text-sm mb-2">
                  <input type="checkbox" checked={!!perms[role]?.[p.key]} onChange={() => toggle(role, p.key)} />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-6 flex space-x-2">
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-500 text-white rounded-md">{saving ? 'Saving...' : 'Save'}</button>
          <button onClick={resetDefaults} className="px-4 py-2 bg-gray-200 rounded-md">Reset Defaults</button>
        </div>
      </div>
    </div>
  );
}

export default RoleManagement;
