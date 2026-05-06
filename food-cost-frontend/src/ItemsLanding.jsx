import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

function ItemsLanding() {
  const [itemsByCategory, setItemsByCategory] = useState({});
  const [coverageSummary, setCoverageSummary] = useState({
    totalItems: 0,
    missingRecipe: 0
  });
  const [missingRecipeItems, setMissingRecipeItems] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [filterText, setFilterText] = useState('');
  const [user] = useState(getLocalUser());
  const [allowedEdit, setAllowedEdit] = useState(false);

  useEffect(() => {
    setAllowedEdit(canEdit(user, 'items'));
  }, [user]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await api.get('/api/items');
        if (!mounted) return;
        const data = res.data;
        if (!Array.isArray(data)) {
          console.warn('Unexpected items payload, expected array:', data);
          setItemsByCategory({});
          return;
        }

        const grouped = data.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) acc[category] = [];
          acc[category].push(item);
          return acc;
        }, {});
        for (const category in grouped) {
          grouped[category].sort((a, b) => a.name.localeCompare(b.name));
        }

        setItemsByCategory(grouped);
        const missingRecipes = data.filter((item) => item.recipe_coverage_status === 'missing_recipe');
        setCoverageSummary({
          totalItems: data.length,
          missingRecipe: missingRecipes.length
        });
        setMissingRecipeItems(missingRecipes.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      } catch (err) {
        console.error('Error fetching items:', err.response || err);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);
  
  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  console.log("Rendering ItemsLanding");

  const normalizedFilter = filterText.trim().toLowerCase();
  const filteredEntries = Object.entries(itemsByCategory)
    .map(([category, items]) => {
      if (!normalizedFilter) return [category, items];
      const matchingItems = items.filter((item) => (item.name || '').toLowerCase().includes(normalizedFilter));
      return [category, matchingItems];
    })
    .filter(([, items]) => items.length > 0);

  const coverageBadge = (item) => {
    if (item.recipe_coverage_status === 'missing_recipe') {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
          Missing recipe
        </span>
      );
    }
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Menu Items</h1>
        <Link
          to="/item/new"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          ➕ Add New Item
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="border rounded bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-600">Items</div>
          <div className="text-2xl font-semibold">{coverageSummary.totalItems}</div>
        </div>
      </div>

      {coverageSummary.missingRecipe > 0 && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-red-700">Missing Recipe Alert</div>
              <div className="text-2xl font-semibold text-red-900">{coverageSummary.missingRecipe} items need recipes</div>
              <div className="text-sm text-red-700">These items do not have any recipe rows saved yet.</div>
            </div>
            <div className="text-sm text-red-800 md:max-w-md">
              <div className="font-medium mb-2">Items missing recipes</div>
              <div className="flex flex-wrap gap-2">
                {missingRecipeItems.map((item) => (
                  <Link
                    key={item.item_id}
                    to={`/item/${item.item_id}`}
                    className="rounded-full border border-red-200 bg-white px-3 py-1 hover:border-red-300 hover:text-red-800"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter items by name..."
          className="w-full rounded border border-gray-300 bg-white px-4 py-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {filteredEntries.length === 0 && (
        <div className="rounded border bg-white p-6 text-gray-600 shadow-sm">
          No menu items match "{filterText.trim()}".
        </div>
      )}

      {filteredEntries.map(([category, items]) => (
        <div key={category} className="mb-4 border rounded shadow-sm">
          <button
            onClick={() => toggleCategory(category)}
            className="w-full flex justify-between items-center bg-gray-100 p-4 text-left font-semibold text-lg"
          >
            <span>{category}</span>
            <span>{normalizedFilter || expandedCategories[category] ? '▲' : '▼'}</span>
          </button>
          {(normalizedFilter || expandedCategories[category]) && (
            <ul className="p-4 bg-white border-t">
              {items.map((item) => (
                <li key={item.item_id} className="py-2 flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <Link
                      to={`/item/${item.item_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {item.name} {item.yield_qty ? `— ${item.yield_qty}${item.yield_unit ? ' ' + item.yield_unit : ''}` : ''}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {coverageBadge(item)}
                      {item.recipe_row_count > 0 && (
                        <span className="text-xs text-gray-500">
                          {item.ingredient_recipe_count || 0} ingredient lines, {item.item_recipe_count || 0} prep item lines
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {allowedEdit && (
                      <Link
                        to={`/item/${item.item_id}/edit`}
                        className="text-sm text-gray-500 hover:text-black"
                      >
                        ✏️ Edit
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export default ItemsLanding;
