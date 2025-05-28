import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function IngredientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ingredient, setIngredient] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/ingredients/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch ingredient');
        return res.json();
      })
      .then((data) => {
        console.log('Fetched ingredient:', data);
        if (!data || data.error) throw new Error('Invalid ingredient response');
        if (!Array.isArray(data.recipes)) {
          data.recipes = [];
        }
        setIngredient(data);
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setError('Could not load ingredient data.');
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
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">{ingredient.name}</h2>
      <h3 className="text-lg font-semibold mb-2">Used in Recipes:</h3>
      {!ingredient.recipes || ingredient.recipes.length === 0 ? (
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
      <div className="mt-6 flex gap-4">
        <Link to="/ingredients" className="text-blue-600 hover:underline">
          ← Back to Ingredients
        </Link>
        <button
          onClick={handleArchive}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Archive Ingredient
        </button>
      </div>
    </div>
  );
}

export default IngredientDetail;
