import React, { useEffect, useState } from 'react';

export default function InventoryDashboard() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const ingredientsRes = await fetch('/api/ingredients');
        if (!ingredientsRes.ok) throw new Error('Failed to fetch ingredients');
        const allIngredients = await ingredientsRes.json();
        const visibleIngredients = allIngredients.filter(i => !i.archived);

        const itemsRes = await fetch('/api/items?is_prep=true');
        if (!itemsRes.ok) throw new Error('Failed to fetch items');
        const allItems = await itemsRes.json();
        const visibleItems = allItems.filter(i => !i.archived);

        const allVisible = [
          ...visibleIngredients.map(i => ({ ...i, source_type: 'ingredient', source_id: i.ingredient_id })),
          ...visibleItems.map(i => ({ ...i, source_type: 'item', source_id: i.item_id })),
        ];

        const enriched = await Promise.all(allVisible.map(async (item) => {
          const res = await fetch(`/api/inventory/current?source_type=${item.source_type}&source_id=${item.source_id}`);
          if (!res.ok) throw new Error(`Failed to fetch inventory for ${item.source_id}`);
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

        const groupedByCategory = enriched.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) acc[category] = [];
          acc[category].push(item);
          return acc;
        }, {});
        setInventory(groupedByCategory);
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
      {Object.entries(inventory).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h2 className="text-xl font-semibold mb-2">{category}</h2>
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
              {items.map((item) => (
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
      ))}
    </div>
  );
}