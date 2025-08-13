import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from './utils/auth';

function IngredientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ingredient, setIngredient] = useState(null);
  const [conversions, setConversions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [fromUnit, setFromUnit] = useState('');
  const [toUnit, setToUnit] = useState('');
  const [factor, setFactor] = useState('');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');

  const [priceQuotes, setPriceQuotes] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const ingrRes = await api.get(`/api/ingredients/${id}`);
        const convRes = await api.get(`/api/ingredient_conversions?ingredient_id=${id}`);
        const quotesRes = await api.get(`/api/price_quotes?ingredient_id=${id}&limit=10`);

        if (!mounted) return;
        const ingrData = ingrRes.data;
        if (!ingrData || ingrData.error) throw new Error('Invalid ingredient response');
        if (!Array.isArray(ingrData.recipes)) ingrData.recipes = [];
        setIngredient(ingrData);

        const conversionsData = convRes.data.filter(conv => conv.ingredient_id !== null);
        setConversions(conversionsData);

        setPriceQuotes(quotesRes.data || []);
      } catch (err) {
        console.error('Load error:', err.response || err);
        setError('Could not load ingredient data.');
      }
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  const handleDeleteConversion = async (convId) => {
    try {
      await api.delete(`/api/ingredient_conversions/${convId}`);
      setConversions(conversions.filter(conv => conv.id !== convId));
    } catch (err) {
      console.error('Delete conversion error:', err.response || err);
      setError('Failed to delete conversion.');
    }
  };

  const handleArchive = async () => {
    try {
      await api.put(`/api/ingredients/${id}`, { archived: true });
      navigate('/ingredients');
    } catch (err) {
      console.error('Archive error:', err.response || err);
      setError('Failed to archive ingredient.');
    }
  };

  if (error) {
    return <div className="p-4 text-red-600 font-semibold">{error}</div>;
  }

  if (!ingredient) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold mb-2">{ingredient.name}</h2>
      <p className="text-sm text-gray-500 mb-6">Category: {ingredient.category}</p>

      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-2">Used in Recipes</h3>
        {ingredient.recipes.length === 0 ? (
          <p className="text-gray-600">No recipes use this ingredient.</p>
        ) : (
          <ul className="list-disc ml-6 space-y-1">
            {ingredient.recipes.map((r) => (
              <li key={r.item_id}>
                <Link
                  to={`/item/${r.item_id}`}
                  className="text-blue-600 hover:underline"
                >
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

       <div className="mb-8">
        <h3 className="text-xl font-semibold mb-2">Recent Price Quotes</h3>
        {priceQuotes.length === 0 ? (
          <p className="text-gray-600">No recent price quotes available.</p>
        ) : (
          <table className="w-full border text-sm text-left">
            <thead className="bg-gray-100 text-xs uppercase text-gray-700">
              <tr>
                <th className="border px-3 py-2">Date</th>
                <th className="border px-3 py-2">Source</th>
                <th className="border px-3 py-2">Size Qty</th>
                <th className="border px-3 py-2">Size Unit</th>
                <th className="border px-3 py-2">Price</th>
                <th className="border px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {priceQuotes.map((quote, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="border px-3 py-2">{new Date(quote.date_found).toLocaleDateString()}</td>
                  <td className="border px-3 py-2">{quote.source}</td>
                  <td className="border px-3 py-2">{quote.size_qty}</td>
                  <td className="border px-3 py-2">{quote.size_unit}</td>
                  <td className="border px-3 py-2">${quote.price.toFixed(2)}</td>
                  <td className="border px-3 py-2">{quote.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mb-10">
        <h3 className="text-xl font-semibold mb-2">Conversions</h3>
        {conversions.length === 0 ? (
          <p className="text-gray-600">No ingredient-specific conversions yet.</p>
        ) : (
          <table className="w-full border text-sm text-left">
            <thead className="bg-gray-100 text-xs uppercase text-gray-700">
              <tr>
                <th className="border px-3 py-2">From</th>
                <th className="border px-3 py-2">To</th>
                <th className="border px-3 py-2">Conversion</th>
                <th className="border px-3 py-2 text-center">Global</th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((conv, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="border px-3 py-2">{conv.from_unit}</td>
                  <td className="border px-3 py-2">{conv.to_unit}</td>
                  <td className="border px-3 py-2">{`1 ${conv.from_unit} = ${Number(conv.factor).toPrecision(6)} ${conv.to_unit}`}</td>
                   <td className="border px-3 py-2 text-center">
                     {conv.is_global ? '✅' : ''}
                   </td>
                  <td className="border px-3 py-2 text-center">
                    <button
                      onClick={() => handleDeleteConversion(conv.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add Conversion Form */}
        <div className="mt-4 border-t pt-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showForm ? 'Cancel' : '➕ Add Conversion'}
          </button>

          {showForm && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!fromAmount || !fromUnit || !toAmount || !toUnit) return;

              // factor should be: how many `to_unit` in 1 `from_unit`
              const factor = (parseFloat(toAmount) / parseFloat(fromAmount));
              
               const payload = {
                 ingredient_id: parseInt(id),
                 from_unit: fromUnit.trim().toLowerCase(),
                 to_unit: toUnit.trim().toLowerCase(),
                 factor: factor,
               };

              try {
                const res = await api.post('/api/ingredient_conversions', payload);
                const newConv = res.data;
                setConversions([...conversions, newConv]);
                setShowForm(false);
                setFromAmount('');
                setFromUnit('');
                setToAmount('');
                setToUnit('');
              } catch (err) {
                console.error('Failed to save conversion:', err.response || err);
              }
            }}>
              <div className="flex items-center gap-2 mt-4">
                <input
                  type="number"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  placeholder="Amount"
                  className="border rounded px-2 py-1 text-sm w-24"
                  step="any"
                  required
                />
                <input
                  type="text"
                  value={fromUnit}
                  onChange={(e) => setFromUnit(e.target.value)}
                  placeholder="unit"
                  className="border rounded px-2 py-1 text-sm w-24"
                  required
                />
                <span className="text-gray-500">=</span>
                <input
                  type="number"
                  value={toAmount}
                  onChange={(e) => setToAmount(e.target.value)}
                  placeholder="Amount"
                  className="border rounded px-2 py-1 text-sm w-24"
                  step="any"
                  required
                />
                <input
                  type="text"
                  value={toUnit}
                  onChange={(e) => setToUnit(e.target.value)}
                  placeholder="unit"
                  className="border rounded px-2 py-1 text-sm w-24"
                  required
                />
                <button
                  type="submit"
                  className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                >
                  Save
                </button>
              </div>
            </form>
          )}
        </div>

        {conversions.length > 0 && (
          <table className="w-full border text-sm text-left mt-4">
            <thead>
              <tr>
                <th className="border px-3 py-2">Conversion</th>
                <th className="border px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((conv, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="border px-3 py-2">
                    {conv.factor > 1 
                      ? `1 ${conv.from_unit} = ${conv.factor} ${conv.to_unit}`
                      : `${1/conv.factor} ${conv.to_unit} = 1 ${conv.from_unit}`
                    }
                  </td>
                  <td className="border px-3 py-2 text-center">
                    <button
                      onClick={() => handleDeleteConversion(conv.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Footer navigation buttons */}
        <div className="mt-6 flex flex-wrap gap-4 items-center">
          <Link to="/ingredients" className="text-blue-600 hover:underline">
            ← Back to Ingredients
          </Link>

          <Link
            to={`/ingredients/${id}/edit`}
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
          >
            ✏️ Edit Ingredient
          </Link>
        </div>
      </div>
    </div>
  );
}

export default IngredientDetail;