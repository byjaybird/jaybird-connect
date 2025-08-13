import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './utils/auth';

function Prices() {
  const [quotes, setQuotes] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await api.get('/api/price_quotes');
        if (!mounted) return;
        const data = res.data;
        if (Array.isArray(data)) setQuotes(data);
        else if (Array.isArray(data.price_quotes)) setQuotes(data.price_quotes);
        else if (Array.isArray(data.quotes)) setQuotes(data.quotes);
        else setQuotes([]);
      } catch (err) {
        console.error('Failed to load price quotes', err);
        setQuotes([]);
      }
    }
    load();
    return () => { mounted = false; };
  }, [navigate]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Price Quotes</h1>
          <div className="space-x-4">
            <Link
              to="/prices/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition duration-150 ease-in-out inline-flex items-center"
            >
              <span>Add Quote</span>
            </Link>
            <Link
              to="/receiving/new"
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition duration-150 ease-in-out inline-flex items-center"
            >
              <span>Receive Goods</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full table-auto">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ingredient
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Source
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Notes
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Purchased
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {quotes.map((q) => (
              <tr key={q.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {q.ingredient_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {q.source}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {q.size_qty} {q.size_unit}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ${q.price?.toFixed ? q.price.toFixed(2) : q.price}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {q.date_found ? new Date(q.date_found).toLocaleDateString() : ''}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {q.notes}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {q.is_purchase ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      Yes
                    </span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                      No
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Prices;