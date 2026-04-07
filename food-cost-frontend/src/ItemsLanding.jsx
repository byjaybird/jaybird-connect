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
    missingRecipe: 0,
    missingIngredientLines: 0
  });
  const [expandedCategories, setExpandedCategories] = useState({});
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
        setCoverageSummary({
          totalItems: data.length,
          missingRecipe: data.filter((item) => item.recipe_coverage_status === 'missing_recipe').length,
          missingIngredientLines: data.filter((item) => item.recipe_coverage_status === 'missing_ingredient_lines').length
        });
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

  const coverageBadge = (item) => {
    if (item.recipe_coverage_status === 'missing_recipe') {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
          Missing recipe
        </span>
      );
    }
    if (item.recipe_coverage_status === 'missing_ingredient_lines') {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
          No ingredient lines
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
        <div className="border rounded bg-red-50 p-4 shadow-sm">
          <div className="text-sm text-red-700">Missing recipe</div>
          <div className="text-2xl font-semibold text-red-800">{coverageSummary.missingRecipe}</div>
          <div className="text-xs text-red-700">No recipe rows saved for the item.</div>
        </div>
        <div className="border rounded bg-amber-50 p-4 shadow-sm">
          <div className="text-sm text-amber-800">Missing ingredients</div>
          <div className="text-2xl font-semibold text-amber-900">{coverageSummary.missingIngredientLines}</div>
          <div className="text-xs text-amber-800">Recipe exists, but it does not include any direct ingredient lines.</div>
        </div>
      </div>

      {Object.entries(itemsByCategory).map(([category, items]) => (
        <div key={category} className="mb-4 border rounded shadow-sm">
          <button
            onClick={() => toggleCategory(category)}
            className="w-full flex justify-between items-center bg-gray-100 p-4 text-left font-semibold text-lg"
          >
            <span>{category}</span>
            <span>{expandedCategories[category] ? '▲' : '▼'}</span>
          </button>
          {expandedCategories[category] && (
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
