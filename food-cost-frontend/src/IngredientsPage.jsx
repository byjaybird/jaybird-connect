import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function IngredientsPage() {
  const [ingredients, setIngredients] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/ingredients`)
      .then((res) => res.json())
      .then(setIngredients);
  }, []);

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const mergeIngredients = () => {
    if (selected.length !== 2) {
      alert('Please select exactly two ingredients to merge.');
      return;
    }

    fetch(`${API_URL}/ingredients/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selected }),
    })
      .then(() => {
        alert('Merge successful!');
        setSelected([]);
        return fetch(`${API_URL}/ingredients`).then((res) => res.json());
      })
      .then(setIngredients);
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Ingredients</h2>
      <ul className="space-y-2">
        {ingredients.map((ingredient) => (
            <li
                key={ingredient.ingredient_id}
                className={`border p-2 rounded cursor-pointer hover:bg-gray-100 ${
                    selected.includes(ingredient.ingredient_id) ? 'bg-blue-100' : ''
                }`}
                onClick={() => toggleSelect(ingredient.ingredient_id)} // Selects on li click
                >
                <Link
                    to={`/ingredient/${ingredient.ingredient_id}`}
                    onClick={(e) => e.stopPropagation()} // Prevents li's onClick from firing when link is clicked
                    className="text-blue-600 hover:underline"
                >
                    {ingredient.name}
                </Link>
            </li>
        ))}
        </ul>
      <button
        onClick={mergeIngredients}
        disabled={selected.length !== 2}
        className="mt-4 px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
      >
        Merge Selected Ingredients
      </button>
    </div>
  );
}

export default IngredientsPage;
