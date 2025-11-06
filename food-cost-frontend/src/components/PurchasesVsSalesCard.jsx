import React, { useEffect, useState } from 'react';
import { api } from '../utils/auth';

export default function PurchasesVsSalesCard() {
  const [date, setDate] = useState('');
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // default to today if supported
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
  }, []);

  useEffect(() => {
    async function load() {
      if (!date) return;
      setLoading(true);
      setError(null);
      try {
        const s = await api.get('/api/sales/daily_agg', { params: { business_date: date } });
        const p = await api.get('/api/purchases/daily_agg', { params: { receive_date: date } });
        setSales(Array.isArray(s.data) ? s.data : []);
        setPurchases(Array.isArray(p.data) ? p.data : []);
      } catch (err) {
        console.error('Failed to load purchases/sales', err);
        setError('Failed to load data for selected date');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [date]);

  // derive totals
  const salesTotal = sales.reduce((acc, r) => acc + (Number(r.net_sales) || 0), 0);
  const purchasesTotal = purchases.reduce((acc, r) => acc + (Number(r.total_cost) || 0), 0);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Purchases vs Sales</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1" />
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div>
          <div className="flex gap-6 mb-4">
            <div className="p-4 bg-gray-50 rounded flex-1">
              <div className="text-sm text-gray-500">Sales (Net)</div>
              <div className="text-2xl font-bold">${salesTotal.toFixed(2)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded flex-1">
              <div className="text-sm text-gray-500">Purchases (Cost)</div>
              <div className="text-2xl font-bold">${purchasesTotal.toFixed(2)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded flex-1">
              <div className="text-sm text-gray-500">Gross Margin</div>
              <div className="text-2xl font-bold">${(salesTotal - purchasesTotal).toFixed(2)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Top Sales (by qty)</h3>
              <div className="max-h-60 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="p-2">Item</th>
                      <th className="p-2">Qty</th>
                      <th className="p-2">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.item_name}</td>
                        <td className="p-2">{r.qty_sold}</td>
                        <td className="p-2">${Number(r.net_sales || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {sales.length === 0 && <tr><td colSpan={3} className="p-4 text-gray-500">No sales rows</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Top Purchases (by cost)</h3>
              <div className="max-h-60 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="p-2">Ingredient</th>
                      <th className="p-2">Units</th>
                      <th className="p-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{p.ingredient_name}</td>
                        <td className="p-2">{p.total_units}</td>
                        <td className="p-2">${Number(p.total_cost || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {purchases.length === 0 && <tr><td colSpan={3} className="p-4 text-gray-500">No purchases rows</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
