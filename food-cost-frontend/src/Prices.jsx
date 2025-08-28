import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './utils/auth';

function Prices() {
  const [quotes, setQuotes] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editQuote, setEditQuote] = useState(null);
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

  const startEdit = (idx) => {
    setEditingIdx(idx);
    setEditQuote({ ...quotes[idx] });
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditQuote(null);
  };

  const saveEdit = async () => {
    if (!editQuote) return;
    try {
      const payload = {
        ingredient_id: editQuote.ingredient_id,
        source: editQuote.source,
        size_qty: parseFloat(editQuote.size_qty),
        size_unit: editQuote.size_unit,
        price: parseFloat(editQuote.price),
        date_found: editQuote.date_found,
        notes: editQuote.notes,
        is_purchase: !!editQuote.is_purchase
      };
      const res = await api.put(`/api/price_quotes/${editQuote.id}`, payload);
      if (res.data && res.status === 200) {
        const updated = [...quotes];
        updated[editingIdx] = res.data;
        setQuotes(updated);
        setEditingIdx(null);
        setEditQuote(null);
      } else {
        alert('Failed to save price quote');
      }
    } catch (err) {
      alert('Failed to save price quote');
    }
  };

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
            {quotes.map((q, idx) => (
              <tr key={q.id} className="hover:bg-gray-50">
                {editingIdx === idx ? (
                  <>
                    <td className="px-6 py-4">
                      <input type="text" value={editQuote.ingredient_name} disabled className="border rounded px-2 py-1 text-sm w-32 bg-gray-100" />
                    </td>
                    <td className="px-6 py-4">
                      <input type="text" value={editQuote.source} onChange={e => setEditQuote(q => ({ ...q, source: e.target.value }))} className="border rounded px-2 py-1 text-sm w-32" />
                    </td>
                    <td className="px-6 py-4">
                      <input type="number" value={editQuote.size_qty} onChange={e => setEditQuote(q => ({ ...q, size_qty: e.target.value }))} className="border rounded px-2 py-1 text-sm w-20" />
                      <input type="text" value={editQuote.size_unit} onChange={e => setEditQuote(q => ({ ...q, size_unit: e.target.value }))} className="border rounded px-2 py-1 text-sm w-20 ml-2" />
                    </td>
                    <td className="px-6 py-4">
                      <input type="number" value={editQuote.price} onChange={e => setEditQuote(q => ({ ...q, price: e.target.value }))} className="border rounded px-2 py-1 text-sm w-20" />
                    </td>
                    <td className="px-6 py-4">
                      <input type="date" value={editQuote.date_found?.slice(0,10) || ''} onChange={e => setEditQuote(q => ({ ...q, date_found: e.target.value }))} className="border rounded px-2 py-1 text-sm w-28" />
                    </td>
                    <td className="px-6 py-4">
                      <input type="text" value={editQuote.notes} onChange={e => setEditQuote(q => ({ ...q, notes: e.target.value }))} className="border rounded px-2 py-1 text-sm w-32" />
                    </td>
                    <td className="px-6 py-4">
                      <select value={editQuote.is_purchase ? 'yes' : 'no'} onChange={e => setEditQuote(q => ({ ...q, is_purchase: e.target.value === 'yes' }))} className="border rounded px-2 py-1 text-sm">
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={saveEdit} className="text-green-600 mr-2">Save</button>
                      <button onClick={cancelEdit} className="text-gray-500">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
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
                    <td className="px-6 py-4">
                      <button onClick={() => startEdit(idx)} className="text-blue-600 mr-2">Edit</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Prices;