import React, { useEffect, useState } from 'react';
import { api } from './utils/auth';
import { Link } from 'react-router-dom';

function formatQty(value, unit) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  const rounded = Math.round(num * 100) / 100;
  return `${rounded.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

function varianceTone(val) {
  if (val === null || val === undefined) return 'text-gray-600';
  if (val < -0.01) return 'text-red-600 font-semibold';
  if (val > 0.01) return 'text-emerald-700 font-semibold';
  return 'text-gray-800';
}

export default function InventoryDashboard() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [lookbackDays, setLookbackDays] = useState(14);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/inventory/reconciliation/latest?lookback_days=${lookbackDays}`);
      setRows(res.data?.results || []);
      setMeta(res.data?.meta || {});
      setError(null);
    } catch (err) {
      console.error('Failed to load inventory reconciliation', err.response || err);
      setError('Unable to load inventory reconciliation. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookbackDays]);

  if (loading) return <div className="p-4">Loading inventory variance...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  const windowLabel = meta?.window_start && meta?.window_end
    ? `${new Date(meta.window_start).toLocaleDateString()} → ${new Date(meta.window_end).toLocaleDateString()}`
    : 'recent';

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory Dashboard</h1>
          <p className="text-gray-600 text-sm">Variance between physical counts and theoretical usage from sales.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">Lookback</label>
          <select
            value={lookbackDays}
            onChange={(e) => setLookbackDays(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={45}>45 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          <button onClick={fetchReconciliation} className="px-3 py-1 border rounded text-sm bg-white hover:bg-gray-50">Reload</button>
          <Link to="/inventory/manual" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Add Inventory (Manual)</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border rounded p-3 bg-white">
          <div className="text-sm text-gray-600">Ingredients reviewed</div>
          <div className="text-2xl font-semibold">{meta?.ingredients_scanned || 0}</div>
          <div className="text-xs text-gray-500">{windowLabel}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-sm text-gray-600">Sales rows without item mapping</div>
          <div className="text-2xl font-semibold">{meta?.sales_skipped_no_item ? Number(meta.sales_skipped_no_item).toFixed(0) : 0}</div>
          <div className="text-xs text-gray-500">These sales could not be tied to a recipe.</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-sm text-gray-600">Data window</div>
          <div className="text-md font-semibold">{windowLabel}</div>
          <div className="text-xs text-gray-500">Counts compared to purchases, adjustments, and sales.</div>
        </div>
      </div>

      {(meta?.sales_skipped_missing_recipe && Object.keys(meta.sales_skipped_missing_recipe).length > 0) && (
        <div className="border rounded p-3 bg-amber-50 text-amber-800 text-sm">
          <div className="font-semibold mb-1">Sales with missing recipes</div>
          <div className="space-y-1">
            {Object.entries(meta.sales_skipped_missing_recipe).map(([name, qty]) => (
              <div key={name} className="flex justify-between">
                <span>{name}</span>
                <span className="font-semibold">{Number(qty).toFixed(2)} sold</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border rounded bg-white overflow-hidden">
        <div className="grid grid-cols-12 bg-gray-50 text-xs font-semibold text-gray-700 uppercase tracking-wide border-b">
          <div className="col-span-3 px-3 py-2">Ingredient</div>
          <div className="col-span-2 px-3 py-2 text-right">Last Count</div>
          <div className="col-span-2 px-3 py-2 text-right">Expected</div>
          <div className="col-span-2 px-3 py-2 text-right">Variance</div>
          <div className="col-span-2 px-3 py-2 text-right">Sales Usage</div>
          <div className="col-span-1 px-3 py-2 text-right">Details</div>
        </div>
        {rows.length === 0 && (
          <div className="p-4 text-sm text-gray-600">No inventory records in this window.</div>
        )}
        {rows.map((row) => {
          const latestUnit = row.latest_count?.base_unit || row.latest_count?.unit || '';
          const expectedUnit = row.latest_count?.base_unit || row.previous_count?.base_unit || latestUnit;
          const variance = row.variance_base;
          const isExpanded = expandedId === row.ingredient_id;

          return (
            <div key={row.ingredient_id} className="border-b last:border-b-0">
              <button
                className="w-full grid grid-cols-12 items-center hover:bg-gray-50 focus:bg-gray-50 transition text-left"
                onClick={() => setExpandedId(isExpanded ? null : row.ingredient_id)}
              >
                <div className="col-span-3 px-3 py-3">
                  <div className="font-semibold text-sm">{row.ingredient_name}</div>
                  <div className="text-xs text-gray-500">
                    {row.previous_count?.created_at
                      ? `Prev count: ${new Date(row.previous_count.created_at).toLocaleDateString()}`
                      : 'No prior count'}
                  </div>
                </div>
                <div className="col-span-2 px-3 py-3 text-right text-sm">
                  {formatQty(row.latest_count?.quantity_base, latestUnit)}
                  <div className="text-xs text-gray-500">{row.latest_count?.created_at ? new Date(row.latest_count.created_at).toLocaleString() : '—'}</div>
                </div>
                <div className="col-span-2 px-3 py-3 text-right text-sm">
                  {row.expected_base !== null && row.expected_base !== undefined
                    ? formatQty(row.expected_base, expectedUnit)
                    : '—'}
                </div>
                <div className="col-span-2 px-3 py-3 text-right text-sm">
                  <span className={varianceTone(variance)}>
                    {variance !== null && variance !== undefined ? formatQty(variance, expectedUnit) : '—'}
                  </span>
                </div>
                <div className="col-span-2 px-3 py-3 text-right text-sm">
                  {formatQty(row.sales_usage_base, expectedUnit)}
                </div>
                <div className="col-span-1 px-3 py-3 text-right text-gray-500 text-xs">
                  {isExpanded ? 'Hide' : 'View'}
                </div>
              </button>

              {isExpanded && (
                <div className="bg-gray-50 border-t px-4 py-3 text-sm space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="border rounded p-3 bg-white">
                      <div className="text-xs text-gray-600 uppercase">Previous Count</div>
                      <div className="font-semibold">{formatQty(row.previous_count?.quantity_base, row.previous_count?.base_unit)}</div>
                      <div className="text-xs text-gray-500">{row.previous_count?.created_at ? new Date(row.previous_count.created_at).toLocaleString() : '—'}</div>
                    </div>
                    <div className="border rounded p-3 bg-white">
                      <div className="text-xs text-gray-600 uppercase">Movements</div>
                      <div className="flex justify-between"><span>Purchases</span><span className="font-semibold">{formatQty(row.purchases_base, expectedUnit)}</span></div>
                      <div className="flex justify-between"><span>Adjustments</span><span className="font-semibold">{formatQty(row.adjustments_base, expectedUnit)}</span></div>
                      <div className="flex justify-between"><span>Sales usage</span><span className="font-semibold">{formatQty(row.sales_usage_base, expectedUnit)}</span></div>
                    </div>
                    <div className="border rounded p-3 bg-white">
                      <div className="text-xs text-gray-600 uppercase">Expected vs Count</div>
                      <div className="flex justify-between"><span>Expected</span><span className="font-semibold">{formatQty(row.expected_base, expectedUnit)}</span></div>
                      <div className="flex justify-between"><span>Actual</span><span className="font-semibold">{formatQty(row.latest_count?.quantity_base, latestUnit)}</span></div>
                      <div className="flex justify-between"><span>Variance</span><span className={varianceTone(variance)}>{formatQty(variance, expectedUnit)}</span></div>
                    </div>
                  </div>

                  {row.sales_breakdown && row.sales_breakdown.length > 0 && (
                    <div className="border rounded bg-white p-3">
                      <div className="text-xs uppercase text-gray-600 mb-2">Sales drivers in window</div>
                      <div className="grid grid-cols-12 text-xs font-semibold text-gray-700 border-b pb-1">
                        <div className="col-span-6">Item</div>
                        <div className="col-span-3 text-right">Qty sold</div>
                        <div className="col-span-3 text-right">Usage ({expectedUnit || 'base'})</div>
                      </div>
                      {row.sales_breakdown.slice(0, 8).map((s, idx) => (
                        <div key={`${s.item_id || s.item_name}-${idx}`} className="grid grid-cols-12 py-1 border-b last:border-b-0 text-xs">
                          <div className="col-span-6">{s.item_name || `Item ${s.item_id || ''}`}</div>
                          <div className="col-span-3 text-right">{Number(s.qty_sold || 0).toFixed(2)}</div>
                          <div className="col-span-3 text-right">{formatQty(s.usage_base, expectedUnit)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
