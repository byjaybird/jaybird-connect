import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/auth';

function UserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({
    email: '',
    name: '',
    role: 'Employee', // default role
    department_id: '',
    active: true
  });

  // --- NEW: edit state ---
  const [editUser, setEditUser] = useState(null); // { employee_id, name, email, role }
  const [savingEdit, setSavingEdit] = useState(false);

  // Fetch users
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/users');
      setUsers(response.data || []);
    } catch (error) {
      console.error('Error fetching users:', error.response || error);
      alert('Failed to load users: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/api/users', newUser);
      setNewUser({
        email: '',
        name: '',
        role: 'Employee',
        department_id: '',
        active: true
      });
      await fetchUsers();
    } catch (error) {
      console.error('Error creating user:', error.response || error);
      alert(error.response?.data?.error || 'Failed to create user');
    }
  };

  const toggleUserActive = async (userId, currentActive) => {
    try {
      await api.patch(`/api/users/${userId}`, { active: !currentActive });
      await fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error.response || error);
      alert('Failed to update user');
    }
  };

  // --- NEW: edit handlers ---
  const openEdit = (user) => {
    setEditUser({
      employee_id: user.employee_id,
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'Employee'
    });
  };

  const cancelEdit = () => {
    setEditUser(null);
  };

  const handleEditChange = (field, value) => {
    setEditUser((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdit = async () => {
    if (!editUser) return;
    const { employee_id, name, email, role } = editUser;
    if (!name || !email) return alert('Name and email are required');
    try {
      setSavingEdit(true);
      await api.patch(`/api/users/${employee_id}`, { name, email, role });
      await fetchUsers();
      setEditUser(null);
    } catch (err) {
      console.error('Failed to save user edit', err.response || err);
      alert(err.response?.data?.error || 'Failed to save user');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">User Management</h2>

      {/* Edit user panel */}
      {editUser && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h3 className="text-xl font-semibold mb-4">Edit User</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={editUser.email}
                onChange={(e) => handleEditChange('email', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={editUser.name}
                onChange={(e) => handleEditChange('name', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <select
                value={editUser.role}
                onChange={(e) => handleEditChange('role', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="Employee">Employee</option>
                <option value="Admin">Admin</option>
                <option value="Manager">Manager</option>
              </select>
            </div>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={saveEdit}
              disabled={savingEdit}
              className={`px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 ${savingEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={cancelEdit} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400">Cancel</button>
          </div>
        </div>
      )}

      {/* Add New User Form */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h3 className="text-xl font-semibold mb-4">Add New User</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="Employee">Employee</option>
                <option value="Admin">Admin</option>
                <option value="Manager">Manager</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
          >
            Add User
          </button>
        </form>
      </div>

      {/* Users List */}
      <div className="bg-white rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.employee_id}>
                <td className="px-6 py-4 whitespace-nowrap">{user.name}</td>
                <td className="px-6 py-4 whitespace-nowrap">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap">{user.role}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {user.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap space-x-2">
                  <button
                    onClick={() => toggleUserActive(user.employee_id, user.active)}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${user.active ? 'bg-red-100 text-red-800 hover:bg-red-200' : 'bg-green-100 text-green-800 hover:bg-green-200'}`}
                  >
                    {user.active ? 'Deactivate' : 'Activate'}
                  </button>

                  <button
                    onClick={() => openEdit(user)}
                    className="px-3 py-1 rounded-md text-sm font-medium bg-blue-100 text-blue-800 hover:bg-blue-200"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UserManagement;