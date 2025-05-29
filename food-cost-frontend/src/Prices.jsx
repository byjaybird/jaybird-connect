// pages/Prices.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function Prices() {
  const [quotes, setQuotes] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/price_quotes`)
      .then(res => res.json())
      .then(setQuotes);
  }, []);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Price Quotes</h1>
        <Link
          to="/prices/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Add Quote
        </Link>
      </div>

      <table className="min-w-full bg-white border">
        <thead>
          <tr>
            <th className="border px-4 py-2">Ingredient</th>
            <th className="border px-4 py-2">Source</th>
            <th className="border px-4 py-2">Size</th>
            <th className="border px-4 py-2">Price</th>
            <th className="border px-4 py-2">Date</th>
            <th className="border px-4 py-2">Notes</th>
            <th className="border px-4 py-2">Purchased?</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id}>
              <td className="border px-4 py-2">{q.ingredient_name}</td>
              <td className="border px-4 py-2">{q.source}</td>
              <td className="border px-4 py-2">{q.size}</td>
              <td className="border px-4 py-2">${q.price.toFixed(2)}</td>
              <td className="border px-4 py-2">{q.date_found}</td>
              <td className="border px-4 py-2">{q.notes}</td>
              <td className="border px-4 py-2">{q.is_purchase ? 'Yes' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Prices;
