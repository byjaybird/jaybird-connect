import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function EditIngredient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ingredient, setIngredient] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/ingredients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setIngredient(data);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load ingredient');
      });
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setIngredient((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: ingredient.name || '',
      category: ingredient.category || '',
      unit: ingredient.unit || '',
      notes: ingredient.notes || '',
      is_archived: ingredient.is_archived || false
    };

    const res = await fetch(`${API_URL}/ingredients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      navigate(`/ingredients/${id}`);
    } else {
      const error = await res.json();
      alert(error.error || 'Failed to update ingredient');
    }
  };


  if (error) return <div className="p-4 text-red-600 font-semibold">{error}</div>;
  if (!ingredient) return <div className="p-4">Loading...</div>;

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Edit Ingredient</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          name="name"
          value={ingredient.name}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          placeholder="Name"
          required
        />
        <input
          name="category"
          value={ingredient.category || ''}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          placeholder="Category"
        />
        <input
          name="unit"
          value={ingredient.unit || ''}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          placeholder="Unit (e.g. oz, lb, tsp)"
        />
        <textarea
          name="notes"
          value={ingredient.notes || ''}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          placeholder="Notes"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Save Changes
        </button>
        <Link
          to={`/ingredients/${id}`}
          className="text-blue-600 hover:underline ml-4"
        >
          Cancel
        </Link>
      </form>
    </div>
  );
}

export default EditIngredient;
