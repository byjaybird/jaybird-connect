import React, { useEffect, useState } from 'react';
import { api } from '../utils/auth';

export default function SalesMappingManager() {
  const [mappings, setMappings] = useState([]);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newItemId, setNewItemId] = useState('');

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
