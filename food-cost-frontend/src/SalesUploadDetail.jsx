import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from './utils/auth';
import Select from 'react-select';

export default function SalesUploadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lines, setLines] = useState([]);
  const [items, setItems] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
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
        setError('Failed to load upload details');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  const handleChange = (lineId, value) => {
    setLines(lines.map(l => (l.id === lineId ? { ...l, item_id: value } : l)));
  };

  const saveLine = async (line) => {
    setSaving(prev => ({ ...prev, [line.id]: true }));
    try {
      // If the user mapped this sales name to an item, try to persist a global mapping
      // first so future uploads will pick it up automatically.
      if (line.item_id && line.item_name) {
        const norm = (line.item_name || '').trim().toLowerCase();
        const itemIdNum = Number(line.item_id);
        const exists = mappings.find(m => m.normalized === norm && Number(m.item_id) === itemIdNum);
        if (!exists) {
          try {
            const resp = await api.post('/api/sales/mappings', { sales_name: line.item_name, item_id: itemIdNum });
            if (!(resp && resp.data && resp.data.status === 'ok')) {
              console.warn('Mapping API returned unexpected response', resp && resp.data);
              alert('Mapping creation may have failed. See console for details.');
            }
            // refresh mappings in state
            const mres = await api.get('/api/sales/mappings');
            setMappings(Array.isArray(mres.data) ? mres.data : []);
          } catch (e) {
            console.error('Failed to create mapping', e);
            const msg = e?.response?.data?.error || e.message || 'Failed to create mapping';
            // Notify the user but continue to save the line-level mapping
            alert(`Warning: mapping creation failed: ${msg}`);
          }
        }
      }

      // Persist the line-level mapping regardless of mapping creation outcome
      const putResp = await api.put(`/api/sales/lines/${line.id}`, { item_id: line.item_id });
      // Optionally refresh the lines to pick up DB-side effects
      const res = await api.get('/api/sales/lines', { params: { upload_id: id, limit: 2000 } });
      setLines(Array.isArray(res.data) ? res.data : []);

    } catch (err) {
      console.error('Failed to save line mapping', err);
      const msg = err?.response?.data?.error || err.message || 'Save failed';
      alert(`Save failed: ${msg}`);
    } finally {
      setSaving(prev => ({ ...prev, [line.id]: false }));
    }
  };

  const saveAll = async () => {
    setSaving({ all: true });
    try {
      for (const l of lines) {
        try {
          await api.put(`/api/sales/lines/${l.id}`, { item_id: l.item_id });
        } catch (e) {
          console.warn('Failed to save line', l.id, e);
        }
      }
      alert('Saved all mappings (best-effort)');
      // reload
      const res = await api.get('/api/sales/lines', { params: { upload_id: id, limit: 2000 } });
      setLines(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Save all failed', err);
      alert('Save all failed');
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
      // reload lines and mappings
      const [linesRes, mappingsRes] = await Promise.all([
        api.get('/api/sales/lines', { params: { upload_id: id, limit: 2000 } }),
        api.get('/api/sales/mappings')
      ]);
      setLines(Array.isArray(linesRes.data) ? linesRes.data : []);
      setMappings(Array.isArray(mappingsRes.data) ? mappingsRes.data : []);
    } catch (err) {
      console.error('Reconcile failed', err);
      alert('Reconcile failed');
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sales Upload Details</h1>
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

      {loading ? <div>Loading...</div> : error ? <div className="text-red-600">{error}</div> : (
        <div className="bg-white shadow rounded">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-2">Row</th>
                <th className="p-2">Item Name</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Net</th>
                <th className="p-2">Mapped Item</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{idx + 1}</td>
                  <td className="p-2">{l.item_name}</td>
                  <td className="p-2">{l.item_qty}</td>
                  <td className="p-2">{l.net_sales != null ? `$${Number(l.net_sales).toFixed(2)}` : '—'}</td>
                  <td className="p-2">
                    <Select
                      value={(() => {
                        // Prefer the explicit item_id on the line; otherwise fall back to any mapping for the sales name
                        const explicitId = l.item_id;
                        if (explicitId) {
                          const it = items.find(itm => itm.item_id === explicitId);
                          return { value: explicitId, label: it ? it.name : String(explicitId) };
                        }
                        const normName = (l.item_name || '').trim().toLowerCase();
                        const map = mappings.find(m => m.normalized === normName);
                        if (map && map.item_id) {
                          const it2 = items.find(itm => itm.item_id === map.item_id);
                          return { value: map.item_id, label: it2 ? it2.name : String(map.item_id) };
                        }
                        return null;
                      })()}
                      onChange={(selected) => handleChange(l.id, selected ? selected.value : '')}
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
              {lines.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-600">No lines found for this upload</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
