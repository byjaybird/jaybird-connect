import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function IngredientDetail() {
  // Pull the ingredient ID from the URL route params
  const { id } = useParams();

  // For redirecting after archiving
  const navigate = useNavigate();

  // Store the fetched ingredient data
  const [ingredient, setIngredient] = useState(null);

  // If there's an error during fetch/archive, store it here
  const [error, setError] = useState(null);

  // Load ingredient details when this component mounts or when ID changes
  useEffect(() => {
    fetch(`${API_URL}/ingredients/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch ingredient');
        return res.json();
      })
      .then((data) => {
        // Basic validation for data structure
        if (!data || data.error) throw new Error('Invalid ingredient response');
        if (!Array.isArray(data.recipes)) {
          data.recipes = [];
        }
        setIngredient(data); // Set the loaded data into state
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setError('Could not load ingredient data.');
      });
  }, [id]);

  // Archive handler – sets the ingredient's `archived` flag to true
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
        navigate('/ingredients'); // Navigate back to ingredient list after archiving
      })
      .catch((err) => {
        console.error('Archive error:', err);
        setError('Failed to archive ingredient.');
      });
  };

  // Show error message if one occurred
  if (error) {
    return <div className="p-4 text-red-600 font-semibold">{error}</div>;
  }

  // Show loading state if ingredient is still null
  if (!ingredient) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Ingredient name at the top */}
      <h2 className="text-2xl font-bold mb-4">{ingredient.name}</h2>

      {/* Section to show what recipes this ingredient is used in */}
      <h3 className="text-lg font-semibold mb-2">Used in Recipes:</h3>

      {/* If no items use this ingredient */}
      {!ingredient.recipes || ingredient.recipes.length === 0 ? (
        <p className="text-gray-600">No recipes use this ingredient.</p>
      ) : (
        <ul className="list-disc ml-6 space-y-1">
          {ingredient.recipes.map((r) => (
            <li key={r.item_id}>
              {/* Link to each item's detail page */}
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

      {/* Navigation and archive control */}
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

        <button
          onClick={handleArchive}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          🗑️ Archive Ingredient
        </button>
      </div>
    </div>
  );
}

export default IngredientDetail;
