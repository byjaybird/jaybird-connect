import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function IngredientDetail() {
  const { id } = useParams();
  const [ingredient, setIngredient] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/ingredients/${id}`)  // ✅ corrected path includes 'ingredients'
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch ingredient');
        return res.json();
      })
      .then((data) => {
        console.log('Fetched ingredient:', data);
        if (!data || data.error) throw new Error('Invalid ingredient response');
        setIngredient(data);
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setError('Could not load ingredient data.');
      });
  }, [id]);

  if (error) {
    return <div className="p-4 text-red-600 font-semibold">{error}</div>;
  }

  if (!ingredient) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">{ingredient.name}</h2>
      <h3 className="text-lg font-semibold mb-2">Used in Recipes:</h3>
      {ingredient.recipes.length === 0 ? (
        <p className="text-gray-600">No recipes use this ingredient.</p>
      ) : (
        <ul className="list-disc ml-6 space-y-1">
          {ingredient.recipes.map((r) => (
            <li key={r.id}>
              <Link
                to={`/item/${r.id}`}
                className="text-blue-600 hover:underline"
              >
                {r.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/ingredients" className="mt-4 inline-block text-blue-600 hover:underline">
        ← Back to Ingredients
      </Link>
    </div>
  );
}

export default IngredientDetail;
