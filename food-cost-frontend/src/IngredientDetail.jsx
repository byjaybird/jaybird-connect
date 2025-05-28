import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function IngredientDetail() {
  const { id } = useParams();
  const [ingredient, setIngredient] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/ingredients/${id}`)
      .then((res) => res.json())
      .then(setIngredient);
  }, [id]);

  if (!ingredient) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">{ingredient.name}</h2>
      <h3 className="text-lg font-semibold mb-2">Used in Recipes:</h3>
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
      <Link to="/ingredients" className="mt-4 inline-block text-blue-600 hover:underline">
        ← Back to Ingredients
      </Link>
    </div>
  );
}

export default IngredientDetail;
