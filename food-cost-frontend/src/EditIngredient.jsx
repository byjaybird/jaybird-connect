import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from './utils/auth';
import { canEdit } from './utils/permissions';

function getLocalUser() {
  try {
    const raw = localStorage.getItem('appUser');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function EditIngredient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ingredient, setIngredient] = useState(null);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(getLocalUser());
  const [allowedEdit, setAllowedEdit] = useState(false);

  useEffect(() => {
    setAllowedEdit(canEdit(user, 'ingredients'));
  }, [user]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await api.get(`/api/ingredients/${id}?include_archived=true`);
        if (!mounted) return;
        if (res.data.error) throw new Error(res.data.error);
        setIngredient(res.data);
      } catch (err) {
        console.error(err.response || err);
        setError('Failed to load ingredient');
      }
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setIngredient((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allowedEdit) return alert('You do not have permission to update ingredients');
    const payload = {
      name: ingredient.name || '',
      category: ingredient.category || '',
      unit: ingredient.unit || '',
      notes: ingredient.notes || '',
      is_archived: ingredient.is_archived || false
    };

    try {
      const res = await api.put(`/api/ingredients/${id}`, payload);
      navigate(`/ingredients/${id}`);
    } catch (err) {
      console.error(err.response || err);
      const message = err.response?.data?.error || 'Failed to update ingredient';
      alert(message);
    }
  };

  const handleArchive = async () => {
    if (!allowedEdit) return alert('You do not have permission to archive ingredients');
    try {
      await api.put(`/api/ingredients/${id}`, { is_archived: true });
      navigate(`/ingredients`);
    } catch (err) {
      console.error(err.response || err);
      alert('Failed to archive ingredient');
    }
  };

  if (error) return <div className="p-4 text-red-600 font-semibold">{error}</div>;
  if (!ingredient) return <div className="p-4">Loading...</div>;

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Edit Ingredient</h1>
      {!allowedEdit && <div className="mb-4 text-yellow-700">You can view this ingredient but you do not have permission to change it.</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          name="name"
          value={ingredient.name}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          placeholder="Name"
          required
          autoComplete="off"
        />
        <input
          name="category"
          value={ingredient.category || ''}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          placeholder="Category"
          autoComplete="off"
        />
        <input
          name="unit"
          value={ingredient.unit || ''}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          placeholder="Unit (e.g. oz, lb, tsp)"
          autoComplete="off"
        />
        <textarea
          name="notes"
          value={ingredient.notes || ''}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          placeholder="Notes"
          autoComplete="off"
        />
        <div className="flex space-x-4">
          <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
          disabled={!allowedEdit}
        >
          Save Changes
        </button>
          <button
            type="button"
            onClick={handleArchive}
            className="bg-red-600 text-white px-4 py-2 rounded"
            disabled={!allowedEdit}
        >
            Archive
          </button>
          <Link
            to={`/ingredients/${id}`}
            className="text-blue-600 hover:underline ml-4"
          >
            Cancel
          </Link>
    </div>
      </form>
    </div>
  );
}

export default EditIngredient;

