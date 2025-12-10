import React, { useEffect, useState } from 'react';
import { api } from './utils/auth';
import { Link } from 'react-router-dom';

export default function InventoryDashboard() {
  const [inventory, setInventory] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [reload, setReload] = useState(0);

  // Pagination state per category: { [category]: { page: number, pageSize: number } }
  const DEFAULT_PAGE_SIZE = 50;
  const [pagination, setPagination] = useState({});

  // Sort state per category: { [category]: { key: string, dir: 'asc'|'desc' } }
  const [sortState, setSortState] = useState({});

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const ingredientsRes = await api.get('/api/ingredients');
        const itemsRes = await api.get('/api/items?is_prep=true');

        const allIngredients = ingredientsRes.data || [];
        const allItems = itemsRes.data || [];

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
            quantity_base: latest?.quantity_base != null ? latest.quantity_base : null,
            base_unit: latest?.base_unit || null,
            unit: latest?.unit || item.unit || '-',
            location: latest?.location || '-',
            created_at: latest?.created_at || null,
            user_id: latest?.user_id || '-'
          };
        });

        // Fetch expected quantities for ingredients based on received goods + adjustments
        try {
          const ingredientItems = allVisible.filter(i => i.source_type === 'ingredient').map(i => ({ source_type: 'ingredient', source_id: i.source_id }));
          if (ingredientItems.length > 0) {
            const expRes = await api.post('/api/inventory/expected/batch', { items: ingredientItems });
            const expList = expRes.data && expRes.data.results ? expRes.data.results : [];
            const expLookup = {};
            expList.forEach(e => {
              if (e && e.source_type && (e.source_id !== undefined && e.source_id !== null)) {
                expLookup[`${e.source_type}-${e.source_id}`] = e.data || null;
              }
            });

            // Attach expected fields to enriched
            for (let ev of enriched) {
              if (ev.source_type === 'ingredient') {
                const k = `${ev.source_type}-${ev.source_id}`;
                const d = expLookup[k];
                ev.expected_quantity_base = d ? d.quantity_base : null;
                ev.expected_base_unit = d ? d.base_unit : null;
              } else {
                ev.expected_quantity_base = null;
                ev.expected_base_unit = null;
              }
            }
          }
        } catch (e) {
          console.warn('Failed to fetch expected inventory', e);
        }

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

        // Initialize default sort (by Item name asc) for each category
        const initialSort = Object.keys(groupedByCategory).reduce((acc, cat) => {
          acc[cat] = { key: 'name', dir: 'asc' };
          return acc;
        }, {});
        setSortState(initialSort);

        setError(null);
      } catch (err) {
        console.error('Failed to fetch inventory', err.response || err);
        setError('Failed to load inventory data. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchInventory();
  }, [reload]);
  
  if (loading) return <div className="p-4">Loading inventory...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  // Sorting helper
  const compareValues = (a, b, key) => {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;

    // handle nested/computed keys
    switch (key) {
      case 'name':
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
      case 'type':
        return String(a.source_type || '').localeCompare(String(b.source_type || ''), undefined, { sensitivity: 'base' });
      case 'quantity':
        return Number(a.quantity || 0) - Number(b.quantity || 0);
      case 'unit':
        return String(a.unit || '').localeCompare(String(b.unit || ''), undefined, { sensitivity: 'base' });
      case 'expected': {
        const va = a.expected_quantity_base != null ? Number(a.expected_quantity_base) : null;
        const vb = b.expected_quantity_base != null ? Number(b.expected_quantity_base) : null;
        if (va == null && vb == null) return 0;
        if (va == null) return -1;
        if (vb == null) return 1;
        return va - vb;
      }
      case 'variance': {
        const va = (a.quantity_base != null && a.expected_quantity_base != null) ? Number(a.quantity_base) - Number(a.expected_quantity_base) : null;
        const vb = (b.quantity_base != null && b.expected_quantity_base != null) ? Number(b.quantity_base) - Number(b.expected_quantity_base) : null;
        if (va == null && vb == null) return 0;
        if (va == null) return -1;
        if (vb == null) return 1;
        return va - vb;
      }
      case 'location':
        return String(a.location || '').localeCompare(String(b.location || ''), undefined, { sensitivity: 'base' });
      case 'created_at': {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return da - db;
      }
      case 'user':
        return String(a.user_id || '').localeCompare(String(b.user_id || ''), undefined, { sensitivity: 'base' });
      default:
        return 0;
    }
  };

  const handleSort = (category, key) => {
    setSortState(prev => {
      const cur = prev[category] || { key: 'name', dir: 'asc' };
      if (cur.key === key) {
        // toggle direction
        const next = { ...cur, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
        return { ...prev, [category]: next };
      }
      // new key -> default asc
      return { ...prev, [category]: { key, dir: 'asc' } };
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Inventory Dashboard</h1>
        <div>
          <Link to="/inventory/manual" className="bg-blue-600 text-white px-3 py-1 rounded">Add Inventory (Manual)</Link>
        </div>
      </div>


      {Object.entries(inventory).map(([category, items]) => {
        const total = items.length;
        const { page = 1, pageSize = DEFAULT_PAGE_SIZE } = pagination[category] || {};
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const currentPage = Math.min(Math.max(1, page), pageCount);
        const startIdx = (currentPage - 1) * pageSize;

        // Apply sorting before pagination
        const sort = sortState[category] || { key: 'name', dir: 'asc' };
        const itemsCopy = [...items];
        itemsCopy.sort((a, b) => {
          const cmp = compareValues(a, b, sort.key);
          return sort.dir === 'asc' ? cmp : -cmp;
        });

        const pageItems = itemsCopy.slice(startIdx, startIdx + pageSize);

        const setPage = (newPage) => {
          setPagination(prev => ({ ...prev, [category]: { ...(prev[category] || {}), page: newPage } }));
        };
        const setPageSize = (newSize) => {
          setPagination(prev => ({ ...prev, [category]: { ...(prev[category] || {}), pageSize: newSize, page: 1 } }));
        };

        const renderSortIndicator = (cat, key) => {
          const s = sortState[cat];
          if (!s || s.key !== key) return null;
          return s.dir === 'asc' ? ' ▲' : ' ▼';
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
                  <th onClick={() => handleSort(category, 'name')} className="cursor-pointer text-left px-3 py-2 border">Item{renderSortIndicator(category, 'name')}</th>
                  <th onClick={() => handleSort(category, 'type')} className="cursor-pointer text-left px-3 py-2 border">Type{renderSortIndicator(category, 'type')}</th>
                  <th onClick={() => handleSort(category, 'quantity')} className="cursor-pointer text-right px-3 py-2 border">Qty{renderSortIndicator(category, 'quantity')}</th>
                  <th onClick={() => handleSort(category, 'unit')} className="cursor-pointer text-left px-3 py-2 border">Unit{renderSortIndicator(category, 'unit')}</th>
                  <th onClick={() => handleSort(category, 'expected')} className="cursor-pointer text-right px-3 py-2 border">Expected{renderSortIndicator(category, 'expected')}</th>
                  <th onClick={() => handleSort(category, 'variance')} className="cursor-pointer text-right px-3 py-2 border">Variance{renderSortIndicator(category, 'variance')}</th>
                  <th onClick={() => handleSort(category, 'location')} className="cursor-pointer text-left px-3 py-2 border">Location{renderSortIndicator(category, 'location')}</th>
                  <th onClick={() => handleSort(category, 'created_at')} className="cursor-pointer text-left px-3 py-2 border">Last Updated{renderSortIndicator(category, 'created_at')}</th>
                  <th onClick={() => handleSort(category, 'user')} className="cursor-pointer text-left px-3 py-2 border">User{renderSortIndicator(category, 'user')}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={`${item.source_type}-${item.source_id}`} className="border-b">
                    <td className="px-3 py-2 border">{item.name}</td>
                    <td className="px-3 py-2 border">{item.source_type}</td>
                    <td className="px-3 py-2 text-right border">{item.quantity}</td>
                    <td className="px-3 py-2 border">{item.unit}</td>

                    <td className="px-3 py-2 text-right border">
                      {item.expected_quantity_base != null ?
                        `${Number(item.expected_quantity_base).toFixed(2)} ${item.expected_base_unit || item.base_unit || ''}` :
                        '-'
                      }
                    </td>

                    <td className="px-3 py-2 text-right border">
                      { (item.expected_quantity_base != null && item.quantity_base != null) ?
                        `${(Number(item.quantity_base) - Number(item.expected_quantity_base)).toFixed(2)} ${item.base_unit || item.expected_base_unit || ''}` :
                        '-'
                      }
                    </td>

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