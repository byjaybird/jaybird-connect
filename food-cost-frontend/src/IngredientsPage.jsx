import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

function formatDate(value) {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `$${num.toFixed(2)}`;
}

function issueBadgeClasses(status) {
  if (status === 'missing_price') return 'bg-red-100 text-red-700 border-red-200';
  if (status === 'missing_conversion') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'unused') return 'bg-gray-100 text-gray-600 border-gray-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

function IngredientsPage() {
  const [ingredients, setIngredients] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('attention');
  const [filterText, setFilterText] = useState('');
  const [newIngredientName, setNewIngredientName] = useState('');
  const [user] = useState(getLocalUser());
  const [allowedCreate, setAllowedCreate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setAllowedCreate(canEdit(user, 'ingredients'));
  }, [user]);

  const fetchIngredients = async () => {
    try {
      const res = await api.get('/api/ingredients?include_details=true');
      const data = Array.isArray(res.data) ? res.data : [];
      const visible = data.filter((ingredient) => !ingredient.archived);
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
    setSelected((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const handleMerge = async () => {
    if (selected.length < 2) {
      alert('Select at least two ingredients to merge.');
      return;
    }

    try {
      await api.post('/api/ingredients/merge', { ids: selected });
      setSelected([]);
      fetchIngredients();
      navigate('/ingredients');
    } catch (err) {
      console.error('Merge failed', err.response || err);
      setError('Failed to merge ingredients.');
    }
  };

  const handleCreateIngredient = async () => {
    if (!allowedCreate) {
      alert('You do not have permission to create ingredients');
      return;
    }
    if (!newIngredientName || !newIngredientName.trim()) return;

    try {
      await api.post('/api/ingredients', { name: newIngredientName.trim() });
      setNewIngredientName('');
      fetchIngredients();
    } catch (err) {
      console.error('Failed to create ingredient', err.response || err);
      setError('Failed to create ingredient');
    }
  };

  const missingCostIngredients = useMemo(
    () => ingredients.filter((ingredient) => ingredient.cost_status === 'missing_price' || ingredient.cost_status === 'missing_conversion'),
    [ingredients]
  );

  const summary = useMemo(() => ({
    total: ingredients.length,
    inRecipes: ingredients.filter((ingredient) => Number(ingredient.active_recipe_count || 0) > 0).length,
    missingQuote: ingredients.filter((ingredient) => ingredient.cost_status === 'missing_price').length,
    missingConversion: ingredients.filter((ingredient) => ingredient.cost_status === 'missing_conversion').length
  }), [ingredients]);

  const normalizedFilter = filterText.trim().toLowerCase();
  const sortedFilteredIngredients = useMemo(() => {
    const sortPriority = {
      missing_price: 0,
      missing_conversion: 1,
      ok: 2,
      unused: 3
    };

    return ingredients
      .filter((ingredient) => {
        const haystack = [
          ingredient.name || '',
          ingredient.cost_status_label || '',
          ingredient.last_purchase_supplier || '',
          ingredient.latest_quote_source || ''
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedFilter);
      })
      .sort((a, b) => {
        if (sortField === 'name') {
          return (a.name || '').localeCompare(b.name || '');
        }
        if (sortField === 'last_purchase') {
          const aVal = a.last_purchase_date || '';
          const bVal = b.last_purchase_date || '';
          return bVal.localeCompare(aVal) || (a.name || '').localeCompare(b.name || '');
        }
        const aPriority = sortPriority[a.cost_status] ?? 99;
        const bPriority = sortPriority[b.cost_status] ?? 99;
        return aPriority - bPriority || (a.name || '').localeCompare(b.name || '');
      });
  }, [ingredients, normalizedFilter, sortField]);

  if (error) {
    return <div className="p-4 text-red-600 font-semibold">{error}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto mt-8 p-4">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ingredients</h1>
          <p className="text-sm text-gray-600 mt-1">Track purchasing recency and catch ingredients that cannot currently resolve cost in recipes.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            id="newIngredient"
            name="newIngredient"
            placeholder="New ingredient name..."
            value={newIngredientName}
            onChange={(e) => setNewIngredientName(e.target.value)}
            className="border px-3 py-2 rounded"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleCreateIngredient}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-300"
            disabled={!allowedCreate || newIngredientName.trim() === ''}
          >
            Add Ingredient
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="border rounded bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-600">Ingredients</div>
          <div className="text-2xl font-semibold">{summary.total}</div>
        </div>
        <div className="border rounded bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-600">Used In Recipes</div>
          <div className="text-2xl font-semibold">{summary.inRecipes}</div>
        </div>
        <div className="border rounded bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-600">Missing Quotes</div>
          <div className="text-2xl font-semibold text-red-700">{summary.missingQuote}</div>
        </div>
        <div className="border rounded bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-600">Missing Conversions</div>
          <div className="text-2xl font-semibold text-amber-700">{summary.missingConversion}</div>
        </div>
      </div>

      {missingCostIngredients.length > 0 && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-red-700">Ingredient Cost Alerts</div>
              <div className="text-2xl font-semibold text-red-900">{missingCostIngredients.length} ingredients need cost attention</div>
              <div className="text-sm text-red-700">These ingredients are used in recipes but cannot fully resolve cost because they are missing a quote or a unit conversion.</div>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-2xl">
              {missingCostIngredients.map((ingredient) => (
                <Link
                  key={ingredient.ingredient_id}
                  to={`/ingredients/${ingredient.ingredient_id}`}
                  className="rounded-full border border-red-200 bg-white px-3 py-1 text-sm hover:border-red-300 hover:text-red-800"
                >
                  {ingredient.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 lg:flex-row">
        <input
          type="text"
          id="ingredientFilter"
          name="ingredientFilter"
          placeholder="Filter by ingredient, status, or vendor..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="flex-1 rounded border border-gray-300 bg-white px-4 py-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <select
          id="sortField"
          name="sortField"
          value={sortField}
          onChange={(e) => setSortField(e.target.value)}
          className="rounded border border-gray-300 bg-white px-4 py-3 shadow-sm"
        >
          <option value="attention">Sort by Attention</option>
          <option value="name">Sort by Name</option>
          <option value="last_purchase">Sort by Last Purchase</option>
        </select>
        <button
          type="button"
          onClick={handleMerge}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-300"
          disabled={selected.length < 2}
        >
          Merge Selected
        </button>
      </div>

      {sortedFilteredIngredients.length === 0 ? (
        <div className="rounded border bg-white p-6 text-gray-600 shadow-sm">
          No ingredients match "{filterText.trim()}".
        </div>
      ) : (
        <div className="overflow-x-auto rounded border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Select</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Ingredient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Cost Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Recipe Usage</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last Purchase</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Latest Quote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedFilteredIngredients.map((ingredient) => {
                const primaryIssue = ingredient.cost_issue;
                const lastPurchasePrice = formatMoney(ingredient.last_purchase_price_per_unit);
                const latestQuotePrice = formatMoney(ingredient.latest_quote_price);

                return (
                  <tr key={ingredient.ingredient_id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 align-top">
                      <input
                        type="checkbox"
                        checked={selected.includes(ingredient.ingredient_id)}
                        name={`ingredient-${ingredient.ingredient_id}`}
                        onChange={() => toggleSelect(ingredient.ingredient_id)}
                      />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-medium">
                        <Link to={`/ingredients/${ingredient.ingredient_id}`} className="text-blue-600 hover:underline">
                          {ingredient.name}
                        </Link>
                      </div>
                      {ingredient.category && (
                        <div className="text-xs text-gray-500 mt-1">{ingredient.category}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${issueBadgeClasses(ingredient.cost_status)}`}>
                        {ingredient.cost_status_label}
                      </span>
                      {primaryIssue?.message && (
                        <div className="mt-2 text-xs text-gray-600 max-w-xs">{primaryIssue.message}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">
                      <div>{ingredient.active_recipe_count || 0} active recipe rows</div>
                      {ingredient.recipe_units?.length > 0 && (
                        <div className="mt-1 text-xs text-gray-500">
                          Units: {ingredient.recipe_units.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">
                      <div>{formatDate(ingredient.last_purchase_date)}</div>
                      {lastPurchasePrice && ingredient.last_purchase_unit_type ? (
                        <div className="mt-1 text-xs text-gray-500">
                          {lastPurchasePrice}/{ingredient.last_purchase_unit_type}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-400">No purchase history</div>
                      )}
                      {ingredient.last_purchase_supplier && (
                        <div className="mt-1 text-xs text-gray-500">{ingredient.last_purchase_supplier}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">
                      <div>{formatDate(ingredient.latest_quote_date)}</div>
                      {latestQuotePrice && ingredient.latest_quote_size_qty && ingredient.latest_quote_size_unit ? (
                        <div className="mt-1 text-xs text-gray-500">
                          {latestQuotePrice} / {ingredient.latest_quote_size_qty} {ingredient.latest_quote_size_unit}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-400">No quote history</div>
                      )}
                      {ingredient.latest_quote_source && (
                        <div className="mt-1 text-xs text-gray-500">{ingredient.latest_quote_source}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default IngredientsPage;
