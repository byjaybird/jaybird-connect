import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from './utils/auth';

function IngredientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ingredient, setIngredient] = useState(null);
  const [isArchived, setIsArchived] = useState(false);
  const [savingArchive, setSavingArchive] = useState(false);
  const [conversions, setConversions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [fromUnit, setFromUnit] = useState('');
  const [toUnit, setToUnit] = useState('');
  const [factor, setFactor] = useState('');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');

  const [priceQuotes, setPriceQuotes] = useState([]);

  // Track items that are reported as missing conversions involving this ingredient
  const [missingConversions, setMissingConversions] = useState([]);
  const [missingConvLoading, setMissingConvLoading] = useState(false);

  // Inventory entries (from the inventory management side)
  const [inventoryEntries, setInventoryEntries] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState(null);

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

  const [usageLookback, setUsageLookback] = useState(14);
  const [usageData, setUsageData] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState(null);
  const [discrepancyLookback, setDiscrepancyLookback] = useState(30);
  const [discrepancyData, setDiscrepancyData] = useState([]);
  const [discrepancyLoading, setDiscrepancyLoading] = useState(false);
  const [discrepancyError, setDiscrepancyError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        // Request ingredient and include archived so we can show/unarchive it from the UI when necessary
        const ingrRes = await api.get(`/api/ingredients/${id}?include_archived=true`);
        const convRes = await api.get(`/api/ingredient_conversions?ingredient_id=${id}`);
        const quotesRes = await api.get(`/api/price_quotes?ingredient_id=${id}&limit=10`);

        if (!mounted) return;
        const ingrData = ingrRes.data;
        if (!ingrData || ingrData.error) throw new Error('Invalid ingredient response');
        if (!Array.isArray(ingrData.recipes)) ingrData.recipes = [];
        setIngredient(ingrData);
        // Normalize archived value coming from server (could be boolean or string)
        const arch = ingrData.archived;
        const isArch = arch === true || arch === 'true' || arch === 't' || arch === 1 || arch === '1';
        setIsArchived(Boolean(isArch));

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

        // Try to fetch latest inventory entries for this ingredient
        try {
          const invRes = await api.get(`/api/inventory/current?source_type=ingredient&source_id=${id}`);
          if (mounted) setInventoryEntries(Array.isArray(invRes.data) ? invRes.data : (invRes.data ? [invRes.data] : []));
        } catch (e) {
          console.warn('Failed to load inventory entries', e?.response || e);
        }

      } catch (err) {
        console.error('Load error:', err.response || err);
        setError('Could not load ingredient data.');
      }
    }
    load();

    // Load missing conversions specifically for this ingredient
    async function loadMissingConversions() {
      setMissingConvLoading(true);
      try {
        const res = await api.get(`/api/ingredients/${id}/missing_conversions`);
        const data = res.data || [];
        const matches = [];

        const targetIngredientId = parseInt(id, 10);
        function extractMissingConversionsFromIssue(issue, parent) {
          if (!issue) return [];
          const out = [];
          if (Array.isArray(issue)) {
            issue.forEach(i => out.push(...extractMissingConversionsFromIssue(i, parent)));
            return out;
          }

          // Only collect missing_conversion entries that explicitly reference this ingredient
          if (issue.issue === 'missing_conversion' && issue.missing) {
            const missing = issue.missing || {};
            // Some server responses include an ingredient_id on the missing object. Only include
            // entries that match the ingredient we're viewing.
            if (missing.ingredient_id !== undefined && missing.ingredient_id !== null) {
              if (String(missing.ingredient_id) === String(targetIngredientId)) {
                out.push({
                  item_id: parent.item_id,
                  name: parent.name,
                  from_unit: missing.from_unit,
                  to_unit: missing.to_unit,
                  recipe_row: missing.recipe_row,
                  raw: issue
                });
              }
            } else {
              // If the missing entry does not include an ingredient_id, we skip it to avoid
              // showing unrelated missing conversions for other ingredients.
            }
          }

          // Walk nested objects to find deeper missing_conversion entries that may reference this ingredient
          for (const k of Object.keys(issue)) {
            const v = issue[k];
            if (v && typeof v === 'object') {
              out.push(...extractMissingConversionsFromIssue(v, parent));
            }
          }
          return out;
        }

        data.forEach(entry => {
          const parent = { item_id: entry.item_id, name: entry.name };
          const issues = entry.issues || [];
          issues.forEach(iss => {
            const found = extractMissingConversionsFromIssue(iss, parent);
            found.forEach(f => matches.push(f));
          });
        });

        setMissingConversions(matches);
      } catch (e) {
        console.warn('Failed to load missing conversions', e?.response || e);
      } finally {
        setMissingConvLoading(false);
      }
    }

    loadMissingConversions();

    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    let mounted = true;
    async function loadUsage() {
      setUsageLoading(true);
      try {
        const res = await api.get(`/api/ingredients/${id}/usage?lookback_days=${usageLookback}`);
        if (!mounted) return;
        setUsageData(res.data || null);
        setUsageError(null);
      } catch (err) {
        if (!mounted) return;
        setUsageError('Failed to load expected usage from sales.');
      } finally {
        if (mounted) setUsageLoading(false);
      }
    }
    loadUsage();
    return () => { mounted = false; };
  }, [id, usageLookback]);

  useEffect(() => {
    let mounted = true;
    async function loadDiscrepancies() {
      setDiscrepancyLoading(true);
      try {
        const res = await api.get(`/api/inventory/discrepancies?ingredient_id=${id}&lookback_days=${discrepancyLookback}&limit_counts=5`);
        if (!mounted) return;
        setDiscrepancyData(res.data?.results || []);
        setDiscrepancyError(null);
      } catch (err) {
        if (!mounted) return;
        setDiscrepancyError('Failed to load inventory discrepancies for this ingredient.');
      } finally {
        if (mounted) setDiscrepancyLoading(false);
      }
    }
    loadDiscrepancies();
    return () => { mounted = false; };
  }, [id, discrepancyLookback]);

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
      setSavingArchive(true);
      const res = await api.put(`/api/ingredients/${id}`, { archived: true });
      // verify the update by re-fetching the ingredient (include archived to be safe)
      const check = await api.get(`/api/ingredients/${id}?include_archived=true`);
      setIsArchived(Boolean(check.data?.archived));
      // Redirect back to ingredients list after archiving
      navigate('/ingredients');
    } catch (err) {
      console.error('Archive error:', err.response || err);
      // surface server-provided message when available
      const msg = err?.response?.data?.error || err?.response?.data || err.message;
      setError(`Failed to archive ingredient: ${msg}`);
    } finally {
      setSavingArchive(false);
    }
  };

  const handleUnarchive = async () => {
    try {
      setSavingArchive(true);
      const res = await api.put(`/api/ingredients/${id}`, { archived: false });
      // Re-fetch to confirm change persisted
      const check = await api.get(`/api/ingredients/${id}?include_archived=true`);
      if (!check.data || check.data.error) {
        setError('Unarchive request completed but could not verify updated ingredient. Check server logs.');
        return;
      }
      setIngredient(check.data);
      const arch = check.data.archived;
      const isArch = arch === true || arch === 'true' || arch === 't' || arch === 1 || arch === '1';
      setIsArchived(Boolean(isArch));
      setError(null);
    } catch (err) {
      console.error('Unarchive error:', err.response || err);
      const msg = err?.response?.data?.error || err?.response?.data || err.message;
      setError(`Failed to unarchive ingredient: ${msg}`);
    } finally {
      setSavingArchive(false);
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

  // Render archived alert when applicable
  const archivedAlert = isArchived ? (
    <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-800 rounded">
      <strong>Archived:</strong> This ingredient is archived and hidden from most lists. You can unarchive it to make it visible again.
      <div className="mt-2">
        <button onClick={handleUnarchive} disabled={savingArchive} className="bg-white text-red-700 border border-red-700 px-3 py-1 rounded mr-2">Unarchive</button>
        <button onClick={() => navigate('/ingredients')} className="px-3 py-1 border rounded">Back to list</button>
      </div>
    </div>
  ) : null;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {archivedAlert}
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

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-semibold">Expected Usage from Sales</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Lookback</label>
            <select
              value={usageLookback}
              onChange={(e) => setUsageLookback(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
            </select>
          </div>
        </div>
        {usageLoading ? (
          <p className="text-gray-600">Calculating expected usage…</p>
        ) : usageError ? (
          <p className="text-red-600">{usageError}</p>
        ) : usageData ? (
          <div className="border rounded bg-white">
            <div className="p-3 border-b flex items-center justify-between text-sm">
              <div>
                <div className="text-gray-600 text-xs">Window</div>
                <div>{new Date(usageData.window_start).toLocaleDateString()} → {new Date(usageData.window_end).toLocaleDateString()}</div>
              </div>
              <div className="text-right">
                <div className="text-gray-600 text-xs">Total expected usage</div>
                <div className="text-lg font-semibold">
                  {Number(usageData.usage_base || 0).toFixed(2)} {usageData.base_unit || ''}
                </div>
              </div>
            </div>
            <div className="p-3">
              <div className="text-xs uppercase text-gray-600 mb-2">Sales drivers</div>
              {usageData.breakdown && usageData.breakdown.length > 0 ? (
                <table className="w-full text-sm border">
                  <thead className="bg-gray-100 text-xs uppercase text-gray-700">
                    <tr>
                      <th className="border px-3 py-2 text-left">Item</th>
                      <th className="border px-3 py-2 text-right">Qty sold</th>
                      <th className="border px-3 py-2 text-right">Usage ({usageData.base_unit || 'base'})</th>
                      <th className="border px-3 py-2 text-right">Per sale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageData.breakdown.slice(0, 12).map((b, idx) => {
                      const perSale = Number(b.qty_sold || 0) ? (Number(b.usage_base || 0) / Number(b.qty_sold || 1)) : 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="border px-3 py-2">{b.item_name || `Item ${b.item_id}`}</td>
                          <td className="border px-3 py-2 text-right">{Number(b.qty_sold || 0).toFixed(2)}</td>
                          <td className="border px-3 py-2 text-right">{Number(b.usage_base || 0).toFixed(2)}</td>
                          <td className="border px-3 py-2 text-right">{perSale.toFixed(3)} {usageData.base_unit || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-600 text-sm">No sales found in this window.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-600">No usage data available.</p>
        )}
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-semibold">Inventory Count Variances</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Lookback</label>
            <select
              value={discrepancyLookback}
              onChange={(e) => setDiscrepancyLookback(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
        </div>
        {discrepancyLoading ? (
          <p className="text-gray-600">Loading variances…</p>
        ) : discrepancyError ? (
          <p className="text-red-600">{discrepancyError}</p>
        ) : discrepancyData && discrepancyData.length > 0 ? (
          <div className="border rounded bg-white">
            <table className="w-full text-sm border">
              <thead className="bg-gray-100 text-xs uppercase text-gray-700">
                <tr>
                  <th className="border px-3 py-2 text-left">Count Date</th>
                  <th className="border px-3 py-2 text-right">Current</th>
                  <th className="border px-3 py-2 text-right">Expected</th>
                  <th className="border px-3 py-2 text-right">Variance</th>
                  <th className="border px-3 py-2 text-right">Purchases</th>
                  <th className="border px-3 py-2 text-right">Sales Usage</th>
                  <th className="border px-3 py-2 text-right">Adjustments</th>
                </tr>
              </thead>
              <tbody>
                {discrepancyData.slice(0, 5).map((d, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="border px-3 py-2">
                      {d.count_date ? new Date(d.count_date).toLocaleDateString() : '—'}
                      {d.location ? <div className="text-xs text-gray-500">{d.location}</div> : null}
                    </td>
                    <td className="border px-3 py-2 text-right">{Number(d.current_count || 0).toFixed(2)} {d.canonical_unit || ''}</td>
                    <td className="border px-3 py-2 text-right">
                      {d.expected !== null && d.expected !== undefined ? `${Number(d.expected || 0).toFixed(2)} ${d.canonical_unit || ''}` : '—'}
                    </td>
                    <td className="border px-3 py-2 text-right">
                      {d.variance !== null && d.variance !== undefined ? `${Number(d.variance || 0).toFixed(2)} ${d.canonical_unit || ''}` : '—'}
                    </td>
                    <td className="border px-3 py-2 text-right">{Number(d.purchases || 0).toFixed(2)} {d.canonical_unit || ''}</td>
                    <td className="border px-3 py-2 text-right">{Number(d.sales_usage || 0).toFixed(2)} {d.canonical_unit || ''}</td>
                    <td className="border px-3 py-2 text-right">{Number(d.adjustments || 0).toFixed(2)} {d.canonical_unit || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {discrepancyData.some(d => d.conversion_issues && d.conversion_issues.length) && (
              <div className="p-3 text-amber-800 bg-amber-50 text-xs border-t">
                Conversion issues detected; add conversions to clean up variances.
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-600">No inventory counts found in this window.</p>
        )}
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2">Inventory Entries</h3>
        {inventoryLoading ? (
          <p className="text-gray-600">Loading inventory…</p>
        ) : inventoryEntries.length === 0 ? (
          <p className="text-gray-600">No inventory entries found.</p>
        ) : (
          <table className="w-full border text-sm text-left mb-4">
            <thead className="bg-gray-100 text-xs uppercase text-gray-700">
              <tr>
                <th className="border px-3 py-2">Quantity</th>
                <th className="border px-3 py-2">Unit</th>
                <th className="border px-3 py-2">Base Qty</th>
                <th className="border px-3 py-2">Base Unit</th>
                <th className="border px-3 py-2">Location</th>
                <th className="border px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {inventoryEntries.map((ie, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="border px-3 py-2">{ie.quantity}</td>
                  <td className="border px-3 py-2">{ie.unit}</td>
                  <td className="border px-3 py-2">{ie.quantity_base}</td>
                  <td className="border px-3 py-2">{ie.base_unit}</td>
                  <td className="border px-3 py-2">{ie.location}</td>
                  <td className="border px-3 py-2">{ie.created_at ? new Date(ie.created_at).toLocaleString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Items that need conversions for this ingredient */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2">Items Needing Conversions</h3>
        {missingConvLoading ? (
          <p className="text-gray-600">Checking for missing conversions…</p>
        ) : missingConversions.length === 0 ? (
          <p className="text-gray-600">No missing conversions detected for this ingredient.</p>
        ) : (
          <ul className="list-disc ml-6 space-y-2">
            {missingConversions.map((m, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <div>
                  <Link to={`/item/${m.item_id}`} className="text-blue-600 hover:underline mr-2">{m.name || ('Item ' + m.item_id)}</Link>
                  <span className="text-sm text-gray-700">needs conversion <strong>{m.from_unit}</strong> → <strong>{m.to_unit}</strong>{m.recipe_row ? ` (recipe row ${m.recipe_row})` : ''}</span>
                </div>
                <div>
                  <button
                    onClick={() => {
                      // open the add conversion form pre-filled
                      setShowForm(true);
                      setFromUnit((m.from_unit || '').toLowerCase());
                      setToUnit((m.to_unit || '').toLowerCase());
                      setFromAmount('1');
                      setToAmount('');
                      // scroll to form (best-effort)
                      setTimeout(() => {
                        const el = document.querySelector('#add-conversion-form');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 50);
                    }}
                    className="text-sm bg-blue-500 text-white px-3 py-1 rounded"
                  >Add conversion</button>
                </div>
              </li>
            ))}
          </ul>
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
        <div className="mt-4 border-t pt-4" id="add-conversion-form">
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
