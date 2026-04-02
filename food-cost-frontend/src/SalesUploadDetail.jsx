import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from './utils/auth';
import Select from 'react-select';

const normalizeSalesName = (value) => (value || '').trim().toLowerCase();

const buildItemOption = (itemId, items) => {
  if (!itemId) return null;
  const item = items.find((entry) => Number(entry.item_id) === Number(itemId));
  return { value: Number(itemId), label: item ? item.name : String(itemId) };
};

export default function SalesUploadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lines, setLines] = useState([]);
  const [items, setItems] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [createItemName, setCreateItemName] = useState('');
  const [createItemCategory, setCreateItemCategory] = useState('');
  const [creatingItem, setCreatingItem] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [message, setMessage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);

  const loadData = async (keepLoading = false) => {
    if (keepLoading) setLoading(true);
    try {
      setLoadError(null);
      const [lres, ires, mres] = await Promise.all([
        api.get('/api/sales/lines', { params: { upload_id: id, limit: 2000 } }),
        api.get('/api/items'),
        api.get('/api/sales/mappings')
      ]);
      setLines(Array.isArray(lres.data) ? lres.data : []);
      setItems(Array.isArray(ires.data) ? ires.data : []);
      setMappings(Array.isArray(mres.data) ? mres.data : []);
    } catch (err) {
      console.error('Failed to load lines/items/mappings', err);
      setLoadError('Failed to load upload details');
    } finally {
      if (keepLoading) setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        setLoadError(null);
        const [lres, ires, mres] = await Promise.all([
          api.get('/api/sales/lines', { params: { upload_id: id, limit: 2000 } }),
          api.get('/api/items'),
          api.get('/api/sales/mappings')
        ]);
        if (!mounted) return;
        setLines(Array.isArray(lres.data) ? lres.data : []);
        setItems(Array.isArray(ires.data) ? ires.data : []);
        setMappings(Array.isArray(mres.data) ? mres.data : []);
      } catch (err) {
        console.error('Failed to load lines/items/mappings', err);
        if (mounted) setLoadError('Failed to load upload details');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  const unresolvedLines = useMemo(
    () => lines.filter((line) => !String(line.sales_category || '').trim() || !line.item_id),
    [lines]
  );

  const currentLine = unresolvedLines[currentIndex] || null;

  useEffect(() => {
    if (currentIndex >= unresolvedLines.length) {
      setCurrentIndex(unresolvedLines.length > 0 ? unresolvedLines.length - 1 : 0);
    }
  }, [currentIndex, unresolvedLines.length]);

  useEffect(() => {
    if (!currentLine) {
      setShowCreateItem(false);
      return;
    }
    setCreateItemName(currentLine.item_name || '');
    setCreateItemCategory(currentLine.sales_category || '');
    setShowCreateItem(false);
  }, [currentLine?.id]);

  const handleChange = (lineId, value) => {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, item_id: value } : line)));
  };

  const updateLineFields = (lineId, updates) => {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...updates } : line)));
  };

  const persistMapping = async (salesName, itemIdNum) => {
    const norm = normalizeSalesName(salesName);
    if (!norm || !itemIdNum) return;
    const exists = mappings.find((mapping) => mapping.normalized === norm && Number(mapping.item_id) === Number(itemIdNum));
    if (exists) return;
    await api.post('/api/sales/mappings', { sales_name: salesName, item_id: itemIdNum });
    const mres = await api.get('/api/sales/mappings');
    setMappings(Array.isArray(mres.data) ? mres.data : []);
  };

  const saveLine = async (line, options = {}) => {
    const { silent = false } = options;
    setSaving(prev => ({ ...prev, [line.id]: true }));
    setError(null);
    setMessage(null);
    try {
      const category = String(line.sales_category || '').trim();
      if (!category) {
        throw new Error('Category is required before continuing.');
      }
      if (!line.item_id) {
        throw new Error('Map this sales line to a Jaybird Connect item before continuing.');
      }

      if (line.item_name) {
        try {
          await persistMapping(line.item_name, Number(line.item_id));
        } catch (mappingErr) {
          console.error('Failed to create mapping', mappingErr);
          const mappingMsg = mappingErr?.response?.data?.error || mappingErr.message || 'Failed to create mapping';
          if (!silent) {
            setMessage(`Line saved, but the reusable sales mapping could not be updated: ${mappingMsg}`);
          }
        }
      }

      const payload = {
        item_id: line.item_id || null,
        sales_category: category
      };
      const putResp = await api.put(`/api/sales/lines/${line.id}`, payload);
      const updatedLine = putResp?.data?.line;
      if (updatedLine) {
        setLines((prev) => prev.map((entry) => (entry.id === line.id ? updatedLine : entry)));
      } else {
        await loadData(false);
      }
      if (!silent) {
        setMessage(`Saved row ${line.row_num || line.id}.`);
      }
    } catch (err) {
      console.error('Failed to save line mapping', err);
      const msg = err?.response?.data?.error || err.message || 'Save failed';
      if (silent) throw err;
      setError(msg);
    } finally {
      setSaving(prev => ({ ...prev, [line.id]: false }));
    }
  };

  const saveAll = async () => {
    setSaving({ all: true });
    setError(null);
    setMessage(null);
    try {
      const pendingLines = lines.filter((line) => String(line.sales_category || '').trim() && line.item_id);
      for (const l of pendingLines) {
        try {
          await saveLine(l, { silent: true });
        } catch (e) {
          console.warn('Failed to save line', l.id, e);
        }
      }
      setMessage('Saved all fully-resolved lines.');
    } catch (err) {
      console.error('Save all failed', err);
      setError('Save all failed');
    } finally {
      setSaving({});
    }
  };

  const reconcileUpload = async () => {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await api.post('/api/sales/reconcile', { upload_id: id });
      const updated = res?.data?.updated ?? 0;
      setReconcileResult(updated);
      setMessage(`Applied saved mappings to ${updated} rows in this upload.`);
      await loadData(false);
    } catch (err) {
      console.error('Reconcile failed', err);
      setError('Reconcile failed');
    } finally {
      setReconciling(false);
    }
  };

  const createItemForCurrentLine = async () => {
    if (!currentLine) return;
    const trimmedName = createItemName.trim();
    const trimmedCategory = createItemCategory.trim();
    if (!trimmedName) {
      setError('Item name is required to create a new Jaybird Connect item.');
      return;
    }
    if (!trimmedCategory) {
      setError('Category is required before creating a new item.');
      return;
    }

    setCreatingItem(true);
    setError(null);
    setMessage(null);
    try {
      const resp = await api.post('/api/items/new', {
        name: trimmedName,
        category: trimmedCategory,
        is_prep: false,
        is_for_sale: true,
        price: null,
        cost: null,
        description: '',
        process_notes: ''
      });
      const itemId = resp?.data?.item_id;
      if (!itemId) {
        throw new Error(resp?.data?.error || 'Item creation failed');
      }
      await loadData(false);
      updateLineFields(currentLine.id, {
        sales_category: trimmedCategory,
        item_id: itemId
      });
      setShowCreateItem(false);
      setMessage(`Created "${trimmedName}" and attached it to this sales line.`);
    } catch (err) {
      console.error('Failed to create item', err);
      setError(err?.response?.data?.error || err.message || 'Failed to create item');
    } finally {
      setCreatingItem(false);
    }
  };

  const handleSaveAndNext = async () => {
    if (!currentLine) return;
    await saveLine(currentLine);
  };

  const totalLines = lines.length;
  const resolvedCount = totalLines - unresolvedLines.length;
  const progressLabel = totalLines ? `${resolvedCount} of ${totalLines} rows resolved` : 'No rows found';

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sales Upload Review</h1>
          <p className="text-gray-600">Upload ID: {id}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/sales/uploads')} className="bg-gray-200 px-3 py-1 rounded">Back</button>
          <button onClick={saveAll} disabled={saving.all} className="bg-blue-600 text-white px-3 py-1 rounded">Save All</button>
          <button onClick={reconcileUpload} disabled={reconciling} className="bg-indigo-600 text-white px-3 py-1 rounded">{reconciling ? 'Reconciling...' : 'Reconcile Upload'}</button>
        </div>
      </div>

      {reconcileResult !== null && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          Applied mappings to {reconcileResult} rows in this upload.
        </div>
      )}

      {message && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-800 rounded">{message}</div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>
      )}

      {loading ? <div>Loading...</div> : loadError ? <div className="text-red-600">{loadError}</div> : (
        <div className="space-y-6">
          <div className="bg-white shadow rounded p-5 border">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Serial Review</div>
                <div className="text-lg font-semibold text-gray-900">{progressLabel}</div>
                <div className="text-sm text-gray-600">
                  {unresolvedLines.length === 0
                    ? 'Every row already has a category and a mapped item.'
                    : `${unresolvedLines.length} row${unresolvedLines.length === 1 ? '' : 's'} still need review.`}
                </div>
              </div>
              {unresolvedLines.length > 0 && (
                <div className="text-sm text-gray-600">
                  Reviewing row {currentIndex + 1} of {unresolvedLines.length}
                </div>
              )}
            </div>
          </div>

          {currentLine ? (
            <div className="bg-white shadow rounded border p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <SummaryCell label="Upload row" value={currentLine.row_num || currentLine.id} />
                <SummaryCell label="Item name" value={currentLine.item_name || '—'} />
                <SummaryCell label="Qty" value={currentLine.item_qty ?? '—'} />
                <SummaryCell label="Net sales" value={currentLine.net_sales != null ? `$${Number(currentLine.net_sales).toFixed(2)}` : '—'} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Sales Category</label>
                  <input
                    value={currentLine.sales_category || ''}
                    onChange={(e) => updateLineFields(currentLine.id, { sales_category: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Enter category"
                    autoComplete="off"
                  />
                  <p className="mt-2 text-xs text-gray-500">This is required before the line can be completed.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Jaybird Connect Item</label>
                  <Select
                    value={buildItemOption(currentLine.item_id, items)}
                    onChange={(selected) => updateLineFields(currentLine.id, { item_id: selected ? selected.value : null })}
                    options={items.map((item) => ({ value: item.item_id, label: item.name }))}
                    classNamePrefix="react-select"
                    placeholder="Map to item"
                    isClearable
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateItem((prev) => !prev);
                        setCreateItemName(currentLine.item_name || '');
                        setCreateItemCategory(currentLine.sales_category || '');
                      }}
                      className="text-sm text-blue-700 underline"
                    >
                      {showCreateItem ? 'Cancel new item' : 'Create new item'}
                    </button>
                  </div>
                </div>
              </div>

              {showCreateItem && (
                <div className="border rounded bg-gray-50 p-4 space-y-3">
                  <div className="text-sm font-semibold text-gray-800">Create a new Jaybird Connect item</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      value={createItemName}
                      onChange={(e) => setCreateItemName(e.target.value)}
                      className="border rounded px-3 py-2"
                      placeholder="Item name"
                      autoComplete="off"
                    />
                    <input
                      value={createItemCategory}
                      onChange={(e) => setCreateItemCategory(e.target.value)}
                      className="border rounded px-3 py-2"
                      placeholder="Category"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={createItemForCurrentLine}
                      disabled={creatingItem}
                      className="bg-gray-900 text-white px-4 py-2 rounded disabled:opacity-50"
                    >
                      {creatingItem ? 'Creating...' : 'Create Item'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
                    disabled={currentIndex === 0}
                    className="bg-gray-100 text-gray-700 px-4 py-2 rounded border border-gray-200 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, unresolvedLines.length - 1))}
                    disabled={currentIndex >= unresolvedLines.length - 1}
                    className="bg-gray-100 text-gray-700 px-4 py-2 rounded border border-gray-200 disabled:opacity-50"
                  >
                    Skip
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSaveAndNext}
                  disabled={saving[currentLine.id]}
                  className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  {saving[currentLine.id] ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow rounded border p-6">
              <div className="text-lg font-semibold text-gray-900">Upload review complete</div>
              <p className="mt-2 text-gray-600">Every line in this upload has a sales category and a Jaybird Connect item mapping.</p>
              <div className="mt-4 flex gap-3">
                <button onClick={() => navigate('/sales/uploads')} className="bg-gray-100 text-gray-800 px-4 py-2 rounded border border-gray-200">Back to uploads</button>
                <button onClick={() => navigate('/sales/day-review')} className="bg-blue-600 text-white px-4 py-2 rounded">Open day review</button>
              </div>
            </div>
          )}

          <div className="bg-white shadow rounded">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-2">Row</th>
                  <th className="p-2">Item Name</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Qty</th>
                  <th className="p-2">Net</th>
                  <th className="p-2">Mapped Item</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2">{l.row_num || idx + 1}</td>
                    <td className="p-2">{l.item_name}</td>
                    <td className="p-2">
                      <input
                        value={l.sales_category || ''}
                        onChange={(e) => updateLineFields(l.id, { sales_category: e.target.value })}
                        className="w-full border rounded px-2 py-1"
                        placeholder="Category"
                      />
                    </td>
                    <td className="p-2">{l.item_qty}</td>
                    <td className="p-2">{l.net_sales != null ? `$${Number(l.net_sales).toFixed(2)}` : '—'}</td>
                    <td className="p-2 min-w-[260px]">
                      <Select
                        value={buildItemOption(l.item_id, items)}
                        onChange={(selected) => handleChange(l.id, selected ? selected.value : null)}
                        options={items.map(it => ({ value: it.item_id, label: it.name }))}
                        className="react-select-container"
                        classNamePrefix="react-select"
                        isClearable
                        placeholder="-- map to item --"
                        aria-label="Mapped Item"
                      />
                    </td>
                    <td className="p-2">
                      <button onClick={() => saveLine(l)} disabled={saving[l.id]} className="bg-green-600 text-white px-2 py-1 rounded">{saving[l.id] ? 'Saving...' : 'Save'}</button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={7} className="p-4 text-gray-600">No lines found for this upload</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value }) {
  return (
    <div className="rounded border bg-gray-50 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
