import React, { useEffect, useState } from 'react';
import { api } from './utils/auth';

export default function InventoryDashboard() {
  const [inventory, setInventory] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination state per category: { [category]: { page: number, pageSize: number } }
  const DEFAULT_PAGE_SIZE = 50;
  const [pagination, setPagination] = useState({});

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const ingredientsRes = await api.get('/api/ingredients');
        const itemsRes = await api.get('/api/items?is_prep=true');

        const allIngredients = ingredientsRes.data;
        const allItems = itemsRes.data;

        const visibleIngredients = allIngredients.filter(i => !i.archived);
        const visibleItems = allItems.filter(i => !i.is_archived);

        const allVisible = [
          ...visibleIngredients.map(i => ({ ...i, source_type: 'ingredient', source_id: i.ingredient_id })),
          ...visibleItems.map(i => ({ ...i, source_type: 'item', source_id: i.item_id })),
        ];

        // Batch fetch latest inventory rows for all visible items in a single request
        const batchPayload = { items: allVisible.map(i => ({ source_type: i.source_type, source_id: i.source_id })) };
        const batchRes = await api.post('/api/inventory/current/batch', batchPayload);
        if (batchRes.data && batchRes.data.error) {
          throw new Error(batchRes.data.error || 'Batch inventory lookup failed');
        }

        const results = (batchRes.data && batchRes.data.results) || [];
        const lookup = results.reduce((acc, r) => {
          acc[`${r.source_type}-${r.source_id}`] = r;
          return acc;
        }, {});

        const enriched = allVisible.map((item) => {
          const key = `${item.source_type}-${item.source_id}`;
          const res = lookup[key];
          const latest = res && res.data ? res.data : null;
          return {
            ...item,
            quantity: latest?.quantity || 0,
            unit: latest?.unit || item.unit || '-',
            location: latest?.location || '-',
            created_at: latest?.created_at || null,
            user_id: latest?.user_id || '-'
          };
        });

        const groupedByCategory = enriched.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) acc[category] = [];
          acc[category].push(item);
          return acc;
        }, {});

        setInventory(groupedByCategory);

        // Initialize pagination for each category (default page 1)
        const initialPagination = Object.keys(groupedByCategory).reduce((acc, cat) => {
          acc[cat] = { page: 1, pageSize: DEFAULT_PAGE_SIZE };
          return acc;
        }, {});
        setPagination(initialPagination);

        setError(null);
      } catch (err) {
        console.error('Failed to fetch inventory', err.response || err);
        setError('Failed to load inventory data. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchInventory();
  }, []);
  
  if (loading) return <div className="p-4">Loading inventory...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Inventory Dashboard</h1>
      {Object.entries(inventory).map(([category, items]) => {
        const total = items.length;
        const { page = 1, pageSize = DEFAULT_PAGE_SIZE } = pagination[category] || {};
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const currentPage = Math.min(Math.max(1, page), pageCount);
        const startIdx = (currentPage - 1) * pageSize;
        const pageItems = items.slice(startIdx, startIdx + pageSize);

        const setPage = (newPage) => {
          setPagination(prev => ({ ...prev, [category]: { ...(prev[category] || {}), page: newPage } }));
        };
        const setPageSize = (newSize) => {
          setPagination(prev => ({ ...prev, [category]: { ...(prev[category] || {}), pageSize: newSize, page: 1 } }));
        };

        return (
          <div key={category} className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold">{category} <span className="text-sm text-gray-500">({total})</span></h2>
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">Rows:</label>
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 border">Item</th>
                  <th className="text-left px-3 py-2 border">Type</th>
                  <th className="text-right px-3 py-2 border">Qty</th>
                  <th className="text-left px-3 py-2 border">Unit</th>
                  <th className="text-left px-3 py-2 border">Location</th>
                  <th className="text-left px-3 py-2 border">Last Updated</th>
                  <th className="text-left px-3 py-2 border">User</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={`${item.source_type}-${item.source_id}`} className="border-b">
                    <td className="px-3 py-2 border">{item.name}</td>
                    <td className="px-3 py-2 border">{item.source_type}</td>
                    <td className="px-3 py-2 text-right border">{item.quantity}</td>
                    <td className="px-3 py-2 border">{item.unit}</td>
                    <td className="px-3 py-2 border">{item.location}</td>
                    <td className="px-3 py-2 border">{item.created_at ? new Date(item.created_at).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 border">{item.user_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between mt-2">
              <div className="text-sm text-gray-600">Showing {Math.min(startIdx + 1, total)} - {Math.min(startIdx + pageItems.length, total)} of {total}</div>
              <div className="flex items-center space-x-2">
                <button onClick={() => setPage(1)} disabled={currentPage === 1} className="px-2 py-1 border rounded bg-white disabled:opacity-50">First</button>
                <button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} className="px-2 py-1 border rounded bg-white disabled:opacity-50">Prev</button>
                <span className="px-2 py-1 text-sm">Page {currentPage} of {pageCount}</span>
                <button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount} className="px-2 py-1 border rounded bg-white disabled:opacity-50">Next</button>
                <button onClick={() => setPage(pageCount)} disabled={currentPage === pageCount} className="px-2 py-1 border rounded bg-white disabled:opacity-50">Last</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}