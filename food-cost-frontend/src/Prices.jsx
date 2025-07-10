// pages/Prices.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Papa from 'papaparse';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function Prices() {
  const [quotes, setQuotes] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/price_quotes`)
      .then(res => res.json())
      .then(setQuotes);
  }, []);

  const downloadTemplate = () => {
    const template = Papa.unparse([
      { ingredient_name: '', source: '', qty_amount: '', qty_unit: '', price: '', date_found: '', notes: '', is_purchase: '' }
    ], {
      header: true
    });
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'price_quote_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          fetch(`${API_URL}/price_quotes/bulk_insert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quotes: results.data }),
          })
          .then(res => res.json())
          .then(result => {
            if (result.errors && result.errors.length > 0) {
              alert(`Errors: ${result.errors.join(', ')}`);
            } else {
              alert('Bulk upload successful!');
            }
          });
        },
        skipEmptyLines: true
      });
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Price Quotes</h1>
        <div>
          <button
            onClick={downloadTemplate}
            className="bg-green-600 text-white px-4 py-2 rounded mr-2"
          >
            Download Template
          </button>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="mr-2"
          />
          <Link
            to="/prices/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            + Add Quote
          </Link>
          <Link
            to="/receiving/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            + Receive Goods
          </Link>
        </div>
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
              <td className="border px-4 py-2">
                {q.size_qty} {q.size_unit}
              </td>
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

