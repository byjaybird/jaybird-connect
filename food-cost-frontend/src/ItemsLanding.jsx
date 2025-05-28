import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function ItemsLanding() {
  const [itemsByCategory, setItemsByCategory] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});

  useEffect(() => {
    fetch('https://jaybird-connect.ue.r.appspot.com/api/items')
      .then((res) => res.json())
      .then((data) => {
        const grouped = data.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) acc[category] = [];
          acc[category].push(item);
          return acc;
        }, {});
        setItemsByCategory(grouped);
      });
  }, []);
  
  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  console.log("Rendering ItemsLanding");

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
                <li key={item.item_id} className="py-1 flex justify-between">
                  <Link
                    to={`/item/${item.item_id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <Link
                    to={`/item/${item.item_id}/edit`}
                    className="text-sm text-gray-500 hover:text-black ml-4"
                  >
                    ✏️ Edit
                  </Link>
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
