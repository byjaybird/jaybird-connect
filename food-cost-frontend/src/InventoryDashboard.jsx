import React, { useEffect, useState } from 'react';

export default function InventoryDashboard() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const [ingredientsRes, itemsRes] = await Promise.all([
          fetch('/api/ingredients'),
          fetch('/api/items?is_prep=true')
        ]);
        const ingredients = await ingredientsRes.json();
        const prepItems = await itemsRes.json();
        const allItems = [
          ...ingredients.map(i => ({ ...i, source_type: 'ingredient', source_id: i.ingredient_id })),
          ...prepItems.map(i => ({ ...i, source_type: 'item', source_id: i.item_id })),
        ];
        const enriched = await Promise.all(allItems.map(async (item) => {
          const res = await fetch(`/api/inventory/current?source_type=${item.source_type}&source_id=${item.source_id}`);
          const latest = await res.json();
          return {
            ...item,
            quantity: latest?.quantity || 0,
            unit: latest?.unit || item.unit || '-',
            location: latest?.location || '-',
            created_at: latest?.created_at || null,
            user_id: latest?.user_id || '-'
          };
        }));
        setInventory(enriched);
      } catch (err) {
        console.error('Failed to fetch inventory', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInventory();
  }, []);
  
  if (loading) return <div className="p-4">Loading inventory...</div>;
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Inventory Dashboard</h1>
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
          {inventory.map((item) => (
            <tr key={`${item.source_type}-${item.source_id}`} className="border-b">
              <td className="px-3 py-2 border">{item.name}</td>
              <td className="px-3 py-2 border">{item.source_type}</td>
              <td className="px-3 py-2 text-right border">{item.quantity}</td>
              <td className="px-3 py-2 border">{item.unit}</td>
              <td className="px-3 py-2 border">{item.location}</td>
              <td className="px-3 py-2 border">
                {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
              </td>
              <td className="px-3 py-2 border">{item.user_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}