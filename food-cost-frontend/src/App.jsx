import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useParams } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function ItemList() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/items`)
      .then(res => res.json())
      .then(setItems);
  }, []);

  const forSaleItems = items.filter(item => item[4] === 1); // is_for_sale === 1

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Menu Items</h1>
      <ul className="space-y-2">
        {forSaleItems.map(item => (
          <li key={item[0]} className="border p-2 rounded hover:bg-gray-100">
            <Link to={`/item/${item[0]}`} className="text-blue-600 hover:underline">
              {item[1]}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemDetail() {
  const { id } = useParams();
  const [recipe, setRecipe] = useState([]);
  const [itemInfo, setItemInfo] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/recipes/${id}`)
      .then(res => res.json())
      .then(setRecipe);

    fetch(`${API_URL}/items/${id}`)
      .then(res => res.json())
      .then(setItemInfo);
  }, [id]);

  return (
    <div className="p-4">
      {itemInfo && (
        <div className="mb-4">
          <h2 className="text-2xl font-bold">{itemInfo[1]}</h2>
          {itemInfo[5] && <p className="text-gray-700 italic mb-2">{itemInfo[5]}</p>} {/* description */}
          {itemInfo[7] && <p className="text-sm text-gray-600">Notes: {itemInfo[7]}</p>} {/* process_notes */}
        </div>
      )}
      <h3 className="text-xl font-semibold mb-2">Recipe Ingredients</h3>
      <ul className="space-y-1">
        {recipe.map((r, idx) => (
          <li key={idx} className="border p-2 rounded">
            <strong>{r[2]}</strong> – {r[3]} {r[4]}
            {r[5] && <div className="text-sm text-gray-600">{r[5]}</div>}
          </li>
        ))}
      </ul>
      <Link to="/" className="mt-4 inline-block text-blue-600 hover:underline">Back to Menu</Link>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ItemList />} />
        <Route path="/item/:id" element={<ItemDetail />} />
      </Routes>
    </Router>
  );
}

export default App;
