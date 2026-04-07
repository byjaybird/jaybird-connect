import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './utils/auth';

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateTime(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function toInputDate(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const tzOffsetMs = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

export default function InventoryCorrections() {
  const [entries, setEntries] = useState([]);
  const [items, setItems] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [drafts, setDrafts] = useState({});

  const ingredientOptions = useMemo(
    () => (Array.isArray(ingredients) ? ingredients.map((ingredient) => ({
      id: ingredient.ingredient_id,
      name: ingredient.name,
      normalized: normalizeName(ingredient.name)
    })) : []),
    [ingredients]
  );

  const itemOptions = useMemo(
    () => (Array.isArray(items) ? items.map((item) => ({
      id: item.item_id,
      name: item.name
    })) : []),
    [items]
  );

  const getSuggestions = (entry) => {
    if (entry.source_type !== 'item' || !entry.source_name) return [];
    const normalized = normalizeName(entry.source_name);
    if (!normalized) return [];
    const exact = ingredientOptions.filter((ingredient) => ingredient.normalized === normalized);
    if (exact.length > 0) return exact.slice(0, 5);
    return ingredientOptions
      .filter((ingredient) => ingredient.normalized.includes(normalized) || normalized.includes(ingredient.normalized))
      .slice(0, 5);
  };

  const loadEntries = async (searchValue = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '250');
      if (searchValue.trim()) params.set('search', searchValue.trim());
      const res = await api.get(`/api/inventory/entries?${params.toString()}`, { timeout: 20000 });
      const results = Array.isArray(res.data) ? res.data : [];
      setEntries(results);
      setDrafts((current) => {
        const next = { ...current };
        results.forEach((entry) => {
          next[entry.id] = next[entry.id] || {
            source_type: entry.source_type || 'ingredient',
            source_id: entry.source_id || '',
            quantity: entry.quantity ?? '',
            unit: entry.unit || '',
            location: entry.location || '',
            barcode: entry.barcode || '',
            recorded_date: toInputDate(entry.created_at)
          };
        });
        return next;
      });
      setError(null);
    } catch (err) {
      console.error('Failed to load inventory entries', err.response || err);
      setError('Unable to load inventory entries for correction.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [entryRes, itemRes, ingredientRes] = await Promise.all([
          api.get('/api/inventory/entries?limit=250', { timeout: 20000 }),
          api.get('/api/items', { timeout: 20000 }),
          api.get('/api/ingredients', { timeout: 20000 })
        ]);
        if (!mounted) return;
        const entryRows = Array.isArray(entryRes.data) ? entryRes.data : [];
        setEntries(entryRows);
        setItems(Array.isArray(itemRes.data) ? itemRes.data : []);
        setIngredients(Array.isArray(ingredientRes.data) ? ingredientRes.data : []);
        const nextDrafts = {};
        entryRows.forEach((entry) => {
          nextDrafts[entry.id] = {
            source_type: entry.source_type || 'ingredient',
            source_id: entry.source_id || '',
            quantity: entry.quantity ?? '',
            unit: entry.unit || '',
            location: entry.location || '',
            barcode: entry.barcode || '',
            recorded_date: toInputDate(entry.created_at)
          };
        });
        setDrafts(nextDrafts);
        setError(null);
      } catch (err) {
        console.error('Failed to load inventory correction data', err.response || err);
        setError('Unable to load inventory correction data.');
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const setDraftField = (entryId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [entryId]: {
        ...(current[entryId] || {}),
        [field]: value
      }
    }));
  };

  const saveEntry = async (entry) => {
    const draft = drafts[entry.id];
    if (!draft?.source_id) {
      setMessage({ type: 'error', text: `Entry ${entry.id}: choose a mapped item or ingredient before saving.` });
      return;
    }
    setSavingId(entry.id);
    setMessage(null);
    try {
      const payload = {
        source_type: draft.source_type,
        source_id: Number(draft.source_id),
        quantity: draft.quantity,
        unit: draft.unit,
        location: draft.location,
        barcode: draft.barcode,
        recorded_date: draft.recorded_date
      };
      const res = await api.patch(`/api/inventory/entries/${entry.id}`, payload, { timeout: 20000 });
      const updated = res.data?.entry;
      setEntries((current) => current.map((row) => (row.id === entry.id ? updated : row)));
      setDrafts((current) => ({
        ...current,
        [entry.id]: {
          source_type: updated.source_type || 'ingredient',
          source_id: updated.source_id || '',
          quantity: updated.quantity ?? '',
          unit: updated.unit || '',
          location: updated.location || '',
          barcode: updated.barcode || '',
          recorded_date: toInputDate(updated.created_at)
        }
      }));
      setMessage({ type: 'success', text: `Updated inventory entry ${entry.id}.` });
    } catch (err) {
      console.error('Failed to update inventory entry', err.response || err);
      setMessage({ type: 'error', text: err.response?.data?.error || `Failed to update inventory entry ${entry.id}.` });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="p-6">Loading inventory corrections…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory Corrections</h1>
          <p className="text-sm text-gray-600">Review historical inventory entries, remap them from items to ingredients when needed, and correct values in place.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/inventory" className="px-3 py-1 border rounded text-sm bg-white hover:bg-gray-50">Back to Inventory</Link>
          <Link to="/inventory/manual" className="px-3 py-1 rounded text-sm bg-blue-600 text-white">Add Inventory</Link>
        </div>
      </div>

      <div className="border rounded bg-white p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm text-gray-700 mb-1">Search entries</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, unit, location, or barcode"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <button onClick={() => loadEntries(search)} className="px-3 py-2 border rounded text-sm bg-white hover:bg-gray-50">Search</button>
        </div>
        <div className="text-xs text-gray-500">Showing the 250 most recent matching inventory rows.</div>
      </div>

      {message && (
        <div className={`border rounded p-3 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        {entries.length === 0 && (
          <div className="border rounded bg-white p-4 text-sm text-gray-600">No inventory entries matched the current filter.</div>
        )}
        {entries.map((entry) => {
          const draft = drafts[entry.id] || {};
          const suggestions = getSuggestions(entry);
          const sourceChoices = draft.source_type === 'item' ? itemOptions : ingredientOptions;

          return (
            <div key={entry.id} className="border rounded bg-white overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">
                    Entry #{entry.id} · {entry.source_name || `${entry.source_type} ${entry.source_id}`}
                  </div>
                  <div className="text-xs text-gray-500">
                    Current mapping: {entry.source_type} #{entry.source_id} · {formatDateTime(entry.created_at)}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Stored value: {entry.quantity} {entry.unit} · Base: {entry.quantity_base} {entry.base_unit}
                </div>
              </div>

              <div className="p-4 space-y-4">
                {suggestions.length > 0 && (
                  <div className="border rounded bg-amber-50 p-3 text-sm">
                    <div className="font-semibold text-amber-800 mb-2">Possible ingredient matches</div>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion) => (
                        <button
                          key={`${entry.id}-suggest-${suggestion.id}`}
                          type="button"
                          onClick={() => {
                            setDraftField(entry.id, 'source_type', 'ingredient');
                            setDraftField(entry.id, 'source_id', suggestion.id);
                          }}
                          className="px-2 py-1 rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                        >
                          Use ingredient: {suggestion.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Map to</label>
                    <select
                      value={draft.source_type || 'ingredient'}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        const firstOption = nextType === 'item' ? itemOptions[0]?.id : ingredientOptions[0]?.id;
                        setDraftField(entry.id, 'source_type', nextType);
                        setDraftField(entry.id, 'source_id', firstOption || '');
                      }}
                      className="w-full border rounded px-2 py-2"
                    >
                      <option value="ingredient">Ingredient</option>
                      <option value="item">Item</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-700 mb-1">Mapped record</label>
                    <select
                      value={draft.source_id || ''}
                      onChange={(e) => setDraftField(entry.id, 'source_id', e.target.value)}
                      className="w-full border rounded px-2 py-2"
                    >
                      <option value="">Select…</option>
                      {sourceChoices.map((option) => (
                        <option key={`${draft.source_type}-${option.id}`} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      step="any"
                      value={draft.quantity ?? ''}
                      onChange={(e) => setDraftField(entry.id, 'quantity', e.target.value)}
                      className="w-full border rounded px-2 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Unit</label>
                    <input
                      type="text"
                      value={draft.unit || ''}
                      onChange={(e) => setDraftField(entry.id, 'unit', e.target.value)}
                      className="w-full border rounded px-2 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Inventory date</label>
                    <input
                      type="date"
                      value={draft.recorded_date || ''}
                      onChange={(e) => setDraftField(entry.id, 'recorded_date', e.target.value)}
                      className="w-full border rounded px-2 py-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={draft.location || ''}
                      onChange={(e) => setDraftField(entry.id, 'location', e.target.value)}
                      className="w-full border rounded px-2 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Barcode</label>
                    <input
                      type="text"
                      value={draft.barcode || ''}
                      onChange={(e) => setDraftField(entry.id, 'barcode', e.target.value)}
                      className="w-full border rounded px-2 py-2"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => saveEntry(entry)}
                      disabled={savingId === entry.id}
                      className="w-full px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                    >
                      {savingId === entry.id ? 'Saving…' : 'Save correction'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
