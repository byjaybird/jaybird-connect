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

  // New state for price quote form
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteDate, setQuoteDate] = useState('');
  const [quoteSource, setQuoteSource] = useState('');
  const [quoteSizeQty, setQuoteSizeQty] = useState('');
  const [quoteSizeUnit, setQuoteSizeUnit] = useState('');
  const [quotePrice, setQuotePrice] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [submittingQuote, setSubmittingQuote] = useState(false);

  const [editingQuoteIdx, setEditingQuoteIdx] = useState(null);
  const [editQuote, setEditQuote] = useState(null);

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

        // Normalize conversions -> always an array
        let convData = [];
        if (Array.isArray(convRes.data)) {
          convData = convRes.data;
        } else if (Array.isArray(convRes.data.conversions)) {
          convData = convRes.data.conversions;
        } else if (Array.isArray(convRes.data.ingredient_conversions)) {
          convData = convRes.data.ingredient_conversions;
        } else {
          // fallback: if it looks like a single conversion object, wrap it
          if (convRes.data && typeof convRes.data === 'object' && convRes.data.id) {
            convData = [convRes.data];
          } else {
            convData = [];
          }
        }
        setConversions((convData || []).filter(conv => conv && conv.ingredient_id !== null));

        // Normalize price quotes -> always an array
        let quotes = [];
        if (Array.isArray(quotesRes.data)) {
          quotes = quotesRes.data;
        } else if (Array.isArray(quotesRes.data.price_quotes)) {
          quotes = quotesRes.data.price_quotes;
        } else if (Array.isArray(quotesRes.data.quotes)) {
          quotes = quotesRes.data.quotes;
        } else if (Array.isArray(quotesRes.data.data)) {
          quotes = quotesRes.data.data;
        } else {
          // single object fallback
          if (quotesRes.data && typeof quotesRes.data === 'object' && quotesRes.data.id) {
            quotes = [quotesRes.data];
          } else {
            quotes = [];
          }
        }
        setPriceQuotes(quotes || []);

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

  const handleSubmitQuote = async (e) => {
    e.preventDefault();
    if (submittingQuote) return;
    // Basic validation
    if (!quoteSource || !quoteSizeQty || !quoteSizeUnit || !quotePrice) {
      setError('Please complete source, size and price fields for the quote.');
      return;
    }

    const payload = {
      ingredient_id: parseInt(id, 10),
      date_found: quoteDate ? new Date(quoteDate).toISOString() : new Date().toISOString(),
      source: quoteSource.trim(),
      size_qty: parseFloat(quoteSizeQty),
      size_unit: quoteSizeUnit.trim(),
      price: parseFloat(quotePrice),
      notes: quoteNotes ? quoteNotes.trim() : ''
    };

    try {
      setSubmittingQuote(true);
      const res = await api.post('/api/price_quotes', payload);
      const newQuote = res.data;
      // Prepend the new quote so it's visible immediately
      setPriceQuotes([newQuote, ...(priceQuotes || [])]);
      // reset form
      setShowQuoteForm(false);
      setQuoteDate('');
      setQuoteSource('');
      setQuoteSizeQty('');
      setQuoteSizeUnit('');
      setQuotePrice('');
      setQuoteNotes('');
      setError(null);
    } catch (err) {
      console.error('Failed to save price quote:', err.response || err);
      setError('Failed to save price quote.');
    } finally {
      setSubmittingQuote(false);
    }
  };

  const startEditQuote = (idx) => {
    setEditingQuoteIdx(idx);
    setEditQuote({ ...priceQuotes[idx] });
  };

  const cancelEditQuote = () => {
    setEditingQuoteIdx(null);
    setEditQuote(null);
  };

  const saveEditQuote = async () => {
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
        const updated = [...priceQuotes];
        updated[editingQuoteIdx] = res.data;
        setPriceQuotes(updated);
        setEditingQuoteIdx(null);
        setEditQuote(null);
      } else {
        alert('Failed to save price quote');
      }
    } catch (err) {
      alert('Failed to save price quote');
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

        {/* Add Price Quote UI */}
        <div className="mt-2 border-t pt-3">
          <button
            onClick={() => setShowQuoteForm(!showQuoteForm)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showQuoteForm ? 'Cancel' : '➕ Add Price Quote'}
          </button>

          {showQuoteForm && (
            <form onSubmit={handleSubmitQuote} className="mt-3 space-y-2">
              <div className="flex gap-2 items-center">
                <label className="text-sm text-gray-700">Date</label>
                <input
                  type="date"
                  value={quoteDate}
                  onChange={(e) => setQuoteDate(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                />

                <label className="text-sm text-gray-700">Source</label>
                <input
                  type="text"
                  value={quoteSource}
                  onChange={(e) => setQuoteSource(e.target.value)}
                  placeholder="e.g. Vendor name"
                  className="border rounded px-2 py-1 text-sm"
                  required
                />
              </div>

              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={quoteSizeQty}
                  onChange={(e) => setQuoteSizeQty(e.target.value)}
                  placeholder="Size qty"
                  className="border rounded px-2 py-1 text-sm w-24"
                  step="any"
                  required
                />
                <input
                  type="text"
                  value={quoteSizeUnit}
                  onChange={(e) => setQuoteSizeUnit(e.target.value)}
                  placeholder="unit"
                  className="border rounded px-2 py-1 text-sm w-24"
                  required
                />

                <input
                  type="number"
                  value={quotePrice}
                  onChange={(e) => setQuotePrice(e.target.value)}
                  placeholder="Price"
                  className="border rounded px-2 py-1 text-sm w-28"
                  step="any"
                  required
                />

                <input
                  type="text"
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="border rounded px-2 py-1 text-sm flex-1"
                />

                <button
                  type="submit"
                  disabled={submittingQuote}
                  className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                >
                  {submittingQuote ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>

        {priceQuotes.length === 0 ? (
          <p className="text-gray-600">No recent price quotes available.</p>
        ) : (
          <table className="w-full border text-sm text-left mt-4">
            <thead className="bg-gray-100 text-xs uppercase text-gray-700">
              <tr>
                <th className="border px-3 py-2">Date</th>
                <th className="border px-3 py-2">Source</th>
                <th className="border px-3 py-2">Size Qty</th>
                <th className="border px-3 py-2">Size Unit</th>
                <th className="border px-3 py-2">Price</th>
                <th className="border px-3 py-2">Notes</th>
                <th className="border px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {priceQuotes.map((quote, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  {editingQuoteIdx === idx ? (
                    <>
                      <td className="border px-3 py-2">
                        <input type="date" value={editQuote.date_found?.slice(0,10) || ''} onChange={e => setEditQuote(q => ({ ...q, date_found: e.target.value }))} className="border rounded px-2 py-1 text-sm w-32" />
                      </td>
                      <td className="border px-3 py-2">
                        <input type="text" value={editQuote.source} onChange={e => setEditQuote(q => ({ ...q, source: e.target.value }))} className="border rounded px-2 py-1 text-sm w-32" />
                      </td>
                      <td className="border px-3 py-2">
                        <input type="number" value={editQuote.size_qty} onChange={e => setEditQuote(q => ({ ...q, size_qty: e.target.value }))} className="border rounded px-2 py-1 text-sm w-20" />
                      </td>
                      <td className="border px-3 py-2">
                        <input type="text" value={editQuote.size_unit} onChange={e => setEditQuote(q => ({ ...q, size_unit: e.target.value }))} className="border rounded px-2 py-1 text-sm w-20" />
                      </td>
                      <td className="border px-3 py-2">
                        <input type="number" value={editQuote.price} onChange={e => setEditQuote(q => ({ ...q, price: e.target.value }))} className="border rounded px-2 py-1 text-sm w-20" />
                      </td>
                      <td className="border px-3 py-2">
                        <input type="text" value={editQuote.notes} onChange={e => setEditQuote(q => ({ ...q, notes: e.target.value }))} className="border rounded px-2 py-1 text-sm w-32" />
                      </td>
                      <td className="border px-3 py-2">
                        <button onClick={saveEditQuote} className="text-green-600 mr-2">Save</button>
                        <button onClick={cancelEditQuote} className="text-gray-500">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="border px-3 py-2">{new Date(quote.date_found).toLocaleDateString()}</td>
                      <td className="border px-3 py-2">{quote.source}</td>
                      <td className="border px-3 py-2">{quote.size_qty}</td>
                      <td className="border px-3 py-2">{quote.size_unit}</td>
                      <td className="border px-3 py-2">${quote.price.toFixed(2)}</td>
                      <td className="border px-3 py-2">{quote.notes}</td>
                      <td className="border px-3 py-2">
                        <button onClick={() => startEditQuote(idx)} className="text-blue-600 mr-2">Edit</button>
                      </td>
                    </>
                  )}
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