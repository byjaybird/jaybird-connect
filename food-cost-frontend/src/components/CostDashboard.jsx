import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { api } from '../utils/auth';
import PurchasesVsSalesCard from './PurchasesVsSalesCard';

function MissingConversionsCard() {
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get('/api/recipes/missing_conversions')
      .then((res) => {
        if (!mounted) return;
        setMissing(res.data || []);
      })
      .catch((e) => {
        // Auth errors are handled by the axios interceptor; still log for debugging
        console.error('Failed to load missing conversions:', e?.response || e);
      })
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, []);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold mb-2">Missing Conversions</h2>
      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : missing.length === 0 ? (
        <div className="text-sm text-green-600">No missing conversions found.</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-auto">
          {missing.map((m) => (
            <div key={m.item_id} className="p-2 border rounded">
              <div className="font-semibold">{m.name} (ID: {m.item_id})</div>
              <ul className="text-sm text-red-600 mt-1">
                {m.issues.map((iss, i) => (
                  <li key={i}>{iss.issue}: {JSON.stringify(iss.missing || iss.details || iss)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MarginsCard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get('/api/items/margins')
      .then((res) => {
        if (!mounted) return;
        setRows(res.data || []);
      })
      .catch((e) => console.error('Failed to load margins:', e?.response || e))
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, []);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold mb-2">Item Margins</h2>
      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">No items found.</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2">Item</th>
                <th className="p-2">Price</th>
                <th className="p-2">Cost</th>
                <th className="p-2">Margin</th>
                <th className="p-2">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</td>
                  <td className="p-2">{r.cost != null ? `$${r.cost.toFixed(2)}` : '—'}</td>
                  <td className="p-2">{r.margin != null ? `$${r.margin.toFixed(2)}` : '—'}</td>
                  <td className="p-2">{r.margin_pct != null ? `${r.margin_pct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CostDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <MissingConversionsCard />
      <MarginsCard />
      <div className="lg:col-span-2">
        <PurchasesVsSalesCard />
      </div>
    </div>
  );
}
