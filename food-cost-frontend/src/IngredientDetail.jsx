import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function IngredientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ingredient, setIngredient] = useState(null);
  const [conversions, setConversions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [fromUnit, setFromUnit] = useState('');
  const [toUnit, setToUnit] = useState('');
  const [factor, setFactor] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/ingredients/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch ingredient');
        return res.json();
      })
      .then((data) => {
        if (!data || data.error) throw new Error('Invalid ingredient response');
        if (!Array.isArray(data.recipes)) data.recipes = [];
        setIngredient(data);
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setError('Could not load ingredient data.');
      });

    fetch(`${API_URL}/ingredient_conversions?ingredient_id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        // Filter out global conversions
        const filteredConversions = data.filter(conv => conv.ingredient_id !== null);
        setConversions(filteredConversions);
      })
      .catch((err) => {
        console.error('Conversion fetch error:', err);
        setConversions([]);
      });
  }, [id]);

  const handleArchive = () => {
    fetch(`${API_URL}/ingredients/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ archived: true })
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to archive ingredient');
        return res.json();
      })
      .then(() => {
        navigate('/ingredients');
      })
      .catch((err) => {
        console.error('Archive error:', err);
        setError('Failed to archive ingredient.');
      });
  };

  if (error) {
    return <div className="p-4 text-red-600 font-semibold">{error}</div>;
  }

  if (!ingredient) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold mb-2">{ingredient.name}</h2>
      <p className="text-sm text-gray-500 mb-6">Category: {ingredient.category}</p>

      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-2">Used in Recipes</h3>
        {ingredient.recipes.length === 0 ? (
          <p className="text-gray-600">No recipes use this ingredient.</p>
        ) : (
          <ul className="list-disc ml-6 space-y-1">
            {ingredient.recipes.map((r) => (
              <li key={r.item_id}>
                <Link
                  to={`/item/${r.item_id}`}
                  className="text-blue-600 hover:underline"
                >
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-10">
        <h3 className="text-xl font-semibold mb-2">Conversions</h3>
        {conversions.length === 0 ? (
          <p className="text-gray-600">No ingredient-specific conversions yet.</p>
        ) : (
          <table className="w-full border text-sm text-left">
            <thead className="bg-gray-100 text-xs uppercase text-gray-700">
              <tr>
                <th className="border px-3 py-2">From</th>
                <th className="border px-3 py-2">To</th>
                <th className="border px-3 py-2">Factor</th>
                <th className="border px-3 py-2 text-center">Global</th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((conv, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="border px-3 py-2">{conv.from_unit}</td>
                  <td className="border px-3 py-2">{conv.to_unit}</td>
                  <td className="border px-3 py-2">{conv.factor}</td>
                  <td className="border px-3 py-2 text-center">
                    {conv.is_global ? '✅' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add Conversion Form */}
        <div className="mt-4 border-t pt-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showForm ? 'Cancel' : '➕ Add Conversion'}
          </button>

          {showForm && (
            <form
              className="mt-4 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();

                const payload = {
                  ingredient_id: parseInt(id),
                  from_unit: fromUnit.trim().toLowerCase(),
                  to_unit: toUnit.trim().toLowerCase(),
                  factor: parseFloat(factor),
                };

                fetch(`${API_URL}/ingredient_conversions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                })
                  .then((res) => res.json())
                  .then((newConv) => {
                    setConversions([...conversions, newConv]);
                    setShowForm(false);
                    setFromUnit('');
                    setToUnit('');
                    setFactor('');
                  })
                  .catch((err) => {
                    console.error('Failed to save conversion:', err);
                  });
              }}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fromUnit}
                  onChange={(e) => setFromUnit(e.target.value)}
                  placeholder="From unit (e.g. lb)"
                  className="border rounded px-2 py-1 text-sm w-28"
                  required
                />
                <input
                  type="text"
                  value={toUnit}
                  onChange={(e) => setToUnit(e.target.value)}
                  placeholder="To unit (e.g. tbsp)"
                  className="border rounded px-2 py-1 text-sm w-28"
                  required
                />
                <input
                  type="number"
                  value={factor}
                  onChange={(e) => setFactor(e.target.value)}
                  placeholder="Factor"
                  className="border rounded px-2 py-1 text-sm w-24"
                  step="any"
                  required
                />
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Footer navigation buttons */}
      <div className="mt-6 flex flex-wrap gap-4 items-center">
        <Link to="/ingredients" className="text-blue-600 hover:underline">
          ← Back to Ingredients
        </Link>

        <Link
          to={`/ingredients/${id}/edit`}
          className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
        >
          ✏️ Edit Ingredient
        </Link>

    </div>
    </div>
  );
}

export default IngredientDetail;
