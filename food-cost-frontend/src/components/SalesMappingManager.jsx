import React, { useEffect, useState } from 'react';
import { api } from '../utils/auth';

export default function SalesMappingManager() {
  const [mappings, setMappings] = useState([]);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newItemId, setNewItemId] = useState('');
  const [unmapped, setUnmapped] = useState([]);
  const [unmappedLookback, setUnmappedLookback] = useState(60);
  const [unmappedLoading, setUnmappedLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [mresp, iresp] = await Promise.all([
          api.get('/api/sales/mappings'),
          api.get('/api/items')
        ]);
        if (!mounted) return;
        setMappings(Array.isArray(mresp.data) ? mresp.data : []);
        setItems(Array.isArray(iresp.data) ? iresp.data : []);
      } catch (err) {
        console.error('Failed to load mappings/items', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadUnmapped() {
      setUnmappedLoading(true);
      try {
        const resp = await api.get(`/api/sales/unmapped?lookback_days=${unmappedLookback}`);
        if (!mounted) return;
        setUnmapped(resp.data?.results || []);
      } catch (err) {
        console.error('Failed to load unmapped sales', err);
      } finally {
        if (mounted) setUnmappedLoading(false);
      }
    }
    loadUnmapped();
    return () => { mounted = false; };
  }, [unmappedLookback]);

  const handleCreate = async () => {
    if (!newName || !newItemId) return;
    try {
      const resp = await api.post('/api/sales/mappings', { sales_name: newName, item_id: newItemId });
      setMappings([ ...(mappings || []), { mapping_id: resp.data.mapping_id, sales_name: newName, item_id: Number(newItemId) }]);
      setNewName('');
      setNewItemId('');
    } catch (err) {
      console.error('Create mapping failed', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/sales/mappings/${id}`);
      setMappings(mappings.filter(m => m.mapping_id !== id));
    } catch (err) {
      console.error('Delete mapping failed', err);
    }
  };

  const [reconcileDate, setReconcileDate] = useState('');
  const [reconcileResult, setReconcileResult] = useState(null);

  const handleReconcile = async () => {
    try {
      const payload = reconcileDate ? { business_date: reconcileDate } : {};
      const resp = await api.post('/api/sales/reconcile', payload);
      setReconcileResult(resp.data);
      // refresh mappings/list if needed
      const mresp = await api.get('/api/sales/mappings');
      setMappings(Array.isArray(mresp.data) ? mresp.data : []);
    } catch (err) {
      console.error('Reconcile failed', err);
      setReconcileResult({ error: 'Reconcile failed' });
    }
  };

  const filtered = mappings.filter(m => !search || (m.sales_name || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="bg-white rounded shadow p-4">
      <h2 className="text-lg font-semibold mb-2">Sales Item Mappings</h2>

      <div className="mb-4 border rounded p-3 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-semibold text-gray-800">Unmapped sales (last {unmappedLookback} days)</div>
            <div className="text-xs text-gray-600">Map these to clean up product mix.</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Lookback</label>
            <select
              value={unmappedLookback}
              onChange={(e) => setUnmappedLookback(Number(e.target.value))}
              className="border rounded px-2 py-1 text-xs"
            >
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
            </select>
          </div>
        </div>
        {unmappedLoading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : unmapped.length ? (
          <table className="w-full text-sm border">
            <thead className="bg-white text-xs uppercase text-gray-600">
              <tr>
                <th className="border px-2 py-1 text-left">Sales name</th>
                <th className="border px-2 py-1 text-right">Qty sold</th>
                <th className="border px-2 py-1 text-right">Net sales</th>
              </tr>
            </thead>
            <tbody>
              {unmapped.slice(0, 25).map((u, idx) => (
                <tr key={`${u.item_name || 'unmapped'}-${idx}`} className="border-t">
                  <td className="px-2 py-1">{u.item_name || 'Unknown'}</td>
                  <td className="px-2 py-1 text-right">{Number(u.qty_sold || 0).toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${Number(u.net_sales || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-gray-600">No unmapped sales in this window.</div>
        )}
      </div>

      <div className="mb-2 flex gap-2">
        <input placeholder="Search sales name" value={search} onChange={e => setSearch(e.target.value)} className="border rounded px-2 py-1" />
      </div>

      {loading ? <div>Loading...</div> : (
        <div>
          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-2">
            <input placeholder="Sales name" value={newName} onChange={e => setNewName(e.target.value)} className="border rounded px-2 py-1" />
            <select value={newItemId} onChange={e => setNewItemId(e.target.value)} className="border rounded px-2 py-1">
              <option value="">Map to item...</option>
              {items.map(it => <option key={it.item_id} value={it.item_id}>{it.name}</option>)}
            </select>
            <button onClick={handleCreate} className="bg-blue-600 text-white px-3 py-1 rounded">Create Mapping</button>
          </div>

          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
            <input type="date" value={reconcileDate} onChange={e => setReconcileDate(e.target.value)} className="border rounded px-2 py-1" />
            <div className="col-span-2">
              <button onClick={handleReconcile} className="bg-green-600 text-white px-3 py-1 rounded">Run Reconcile</button>
              {reconcileResult && <span className="ml-3 text-sm text-gray-700">Updated: {reconcileResult.updated ?? reconcileResult.error}</span>}
            </div>
          </div>

          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="p-2">Sales Name</th>
                  <th className="p-2">Mapped Item</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.mapping_id} className="border-t">
                    <td className="p-2">{m.sales_name}</td>
                    <td className="p-2">{items.find(it => it.item_id === m.item_id)?.name || m.item_id}</td>
                    <td className="p-2">
                      <button onClick={() => handleDelete(m.mapping_id)} className="text-red-600">Delete</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={3} className="p-4 text-gray-600">No mappings</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
