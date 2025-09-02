import { api } from './auth';

export const AVAILABLE_PAGES = [
  'dashboard','menu','prices','inventory','users','shifts','shift_patterns','shift_manager','tasks','items','ingredients','receiving','inventory_scanner','roles',
  // action-specific permissions
  'items_edit','ingredients_edit'
];

export const fetchRemotePermissions = async () => {
  try {
    const res = await api.get('/api/role-permissions');
    return res.data || null;
  } catch (e) {
    return null;
  }
};

export const readPermissions = () => {
  try {
    const raw = localStorage.getItem('rolePermissions');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read rolePermissions', e);
    return null;
  }
};

export const hasPageAccess = (user, pageKey) => {
  if (!pageKey) return true;
  if (!user) return true; // allow until authenticated user loaded
  const perms = readPermissions();
  if (!perms) return true; // fallback allow if no permissions configured
  const role = (user.role || 'Employee') || 'Employee';
  if (role === 'Admin') return true;
  const roleMap = perms[role] || {};
  return !!roleMap[pageKey];
};

// Check whether user can edit a resource. Resource examples: 'items', 'ingredients'
export const canEdit = (user, resourceKey) => {
  if (!user) return false;
  const role = (user.role || 'Employee').toString();
  // Always allow Admins to edit, even if permissions haven't loaded yet
  if (role.toLowerCase() === 'admin') return true;

  const perms = readPermissions();
  if (!perms) return false; // keep fallback deny for non-admin if no explicit permissions

  const roleMap = perms[role] || {};
  // prefer explicit edit permission (e.g., 'items_edit'), fall back to general view permission
  if (typeof roleMap[`${resourceKey}_edit`] !== 'undefined') {
    return !!roleMap[`${resourceKey}_edit`];
  }
  return !!roleMap[resourceKey];
};
