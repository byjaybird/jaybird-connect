import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './utils/auth';

function IngredientsPage() {
  const [ingredients, setIngredients] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('name');
  const [filterText, setFilterText] = useState('');
  const navigate = useNavigate();

  const fetchIngredients = async () => {
    try {
      const res = await api.get('/api/ingredients');
      const data = res.data;
      const visible = data.filter((i) => !i.archived);
      setIngredients(visible);
    } catch (err) {
      console.error('Failed to fetch ingredients', err.response || err);
      setError('Failed to fetch ingredients');
    }
  };

  useEffect(() => {
    fetchIngredients();
  }, []);

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleMerge = async () => {
    if (selected.length < 2) {
      alert('Select at least two ingredients to merge.');
      return;
    }

    try {
      const res = await api.post('/api/ingredients/merge', { ids: selected });
      setSelected([]);
      fetchIngredients();
      navigate('/ingredients');
    } catch (err) {
      console.error('Merge failed', err.response || err);
      setError('Failed to merge ingredients.');
    }
  };

  const sortedFilteredIngredients = ingredients
    .filter((i) => i.name && i.name.toLowerCase().includes(filterText.toLowerCase()))
    .sort((a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortField === 'type') return (a.type || '').localeCompare(b.type || '');
      return 0;
    });

  const renderIngredients = () => {
    return sortedFilteredIngredients.map((ingredient) => (
          <li key={ingredient.ingredient_id} className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selected.includes(ingredient.ingredient_id)}
          name={`ingredient-${ingredient.ingredient_id}`}
          onChange={() => toggleSelect(ingredient.ingredient_id)}
            />
            <Link
              to={`/ingredients/${ingredient.ingredient_id}`}
              className="text-blue-600 hover:underline"
            >
              {ingredient.name}
            </Link>
          </li>
    ));
  };

  if (error) {
    return <div className="p-4 text-red-600 font-semibold">{error}</div>;
}

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-6">Ingredients</h1>
      <div className="mb-4 flex gap-4">
        <input
          type="text"
          id="ingredientFilter"
          name="ingredientFilter"
          placeholder="Filter by name..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="border px-2 py-1 rounded"
        />
        <select
          id="sortField"
          name="sortField"
          value={sortField}
          onChange={(e) => setSortField(e.target.value)}
          className="border px-2 py-1 rounded"
        >
          <option value="name">Sort by Name</option>
          <option value="type">Sort by Type</option>
        </select>
        <button
          type="button"
          onClick={handleMerge}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          disabled={selected.length < 2}
        >
          Merge Selected
        </button>
      </div>
      <ul className="space-y-2">{renderIngredients()}</ul>
    </div>
  );
}

export default IngredientsPage;
