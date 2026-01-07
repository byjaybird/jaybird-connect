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

function formatPerUnit(usageBase, qtySold, unit) {
  const qtyNum = Number(qtySold);
  if (!qtyNum || Number.isNaN(qtyNum) || qtyNum === 0) return '—';
  const per = Number(usageBase || 0) / qtyNum;
  const rounded = Math.round(per * 1000) / 1000;
  return `${rounded}${unit ? ` ${unit}` : ''} / sale`;
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
  const [reload, setReload] = useState(0);
  const [conversionDrafts, setConversionDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      const res = await api.get(
        `/api/inventory/reconciliation/latest?lookback_days=${lookbackDays}`,
        { timeout: 20000 }
      );
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
  }, [lookbackDays, reload]);

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
          const expectedUnit = row.canonical_unit || row.latest_count?.base_unit || row.previous_count?.base_unit || latestUnit;
          const variance = row.variance_base;
          const isExpanded = expandedId === row.ingredient_id;
          const hasConversionIssues = Array.isArray(row.conversion_issues) && row.conversion_issues.length > 0;

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
                  {hasConversionIssues && (
                    <div className="mt-1 inline-flex items-center text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                      Conversion issues
                    </div>
                  )}
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
                      <div className="text-xs uppercase text-gray-600 mb-2">
                        Sales drivers in window (mapped to recipes, usage shown in base unit)
                      </div>
                      <div className="grid grid-cols-12 text-xs font-semibold text-gray-700 border-b pb-1">
                        <div className="col-span-6">Item</div>
                        <div className="col-span-2 text-right">Qty sold</div>
                        <div className="col-span-2 text-right">Total usage ({expectedUnit || 'base'})</div>
                        <div className="col-span-2 text-right">Usage / sale ({expectedUnit || 'base'})</div>
                      </div>
                      {row.sales_breakdown.slice(0, 12).map((s, idx) => (
                        <div key={`${s.item_id || s.item_name}-${idx}`} className="grid grid-cols-12 py-1 border-b last:border-b-0 text-xs">
                          <div className="col-span-6">{s.item_name || `Item ${s.item_id || ''}`}</div>
                          <div className="col-span-2 text-right">{Number(s.qty_sold || 0).toFixed(2)}</div>
                          <div className="col-span-2 text-right">
                            {formatQty(s.usage_base, expectedUnit)}
                            {s.recipe_unit && s.recipe_unit !== expectedUnit && (
                              <div className="text-[10px] text-gray-500">Recipe unit: {s.recipe_unit}</div>
                            )}
                          </div>
                          <div className="col-span-2 text-right">{formatPerUnit(s.usage_base, s.qty_sold, expectedUnit)}</div>
                        </div>
                      ))}
                      {row.sales_breakdown.length > 12 && (
                        <div className="text-xs text-gray-500 mt-2">Showing top 12 by usage; refine recipe mappings if totals look off (e.g., high qty sold but tiny usage).</div>
                      )}
                    </div>
                  )}
                  {row.purchases && row.purchases.length > 0 && (
                    <div className="border rounded bg-white p-3">
                      <div className="text-xs uppercase text-gray-600 mb-2">Purchases in window</div>
                      <div className="grid grid-cols-12 text-xs font-semibold text-gray-700 border-b pb-1">
                        <div className="col-span-5">Date</div>
                        <div className="col-span-3 text-right">Qty (orig)</div>
                        <div className="col-span-4 text-right">Qty (base)</div>
                      </div>
                      {row.purchases.map((p, idx) => (
                        <div key={`${p.ts}-${idx}`} className="grid grid-cols-12 py-1 border-b last:border-b-0 text-xs">
                          <div className="col-span-5">{p.ts ? new Date(p.ts).toLocaleDateString() : '—'}</div>
                          <div className="col-span-3 text-right">{formatQty(p.quantity, p.unit)}</div>
                          <div className="col-span-4 text-right">{formatQty(p.quantity_base, p.base_unit)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {hasConversionIssues && (
                    <div className="border rounded bg-amber-50 p-3 text-sm text-amber-800">
                      <div className="text-xs uppercase font-semibold mb-1">Conversion issues (please add/update conversions)</div>
                      <div className="space-y-2">
                        {row.conversion_issues.map((c, idx) => {
                          const key = `${row.ingredient_id}-${c.unit || ''}-${c.target || ''}`;
                          const draft = conversionDrafts[key] || { factor: '' };
                          return (
                            <div key={idx} className="border rounded px-2 py-2 bg-white text-gray-800">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-semibold">{c.type}</span>
                                <span>{c.unit || '?'} → {c.target || expectedUnit || 'base'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-600">Factor:</label>
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={draft.factor}
                                  onChange={(e) => setConversionDrafts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), factor: e.target.value } }))}
                                  className="border rounded px-2 py-1 text-xs w-24"
                                  placeholder="e.g. 29.57"
                                />
                                <button
                                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded disabled:opacity-50"
                                  disabled={!draft.factor || draft.saving}
                                  onClick={async () => {
                                    setConversionDrafts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), saving: true, error: null, success: false } }));
                                    try {
                                      await api.post('/api/ingredient_conversions', {
                                        ingredient_id: row.ingredient_id,
                                        from_unit: c.unit,
                                        to_unit: c.target || expectedUnit,
                                        factor: Number(draft.factor),
                                        is_global: false
                                      });
                                      setConversionDrafts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), saving: false, success: true } }));
                                      setReload(r => r + 1);
                                    } catch (err) {
                                      setConversionDrafts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), saving: false, error: 'Save failed' } }));
                                    }
                                  }}
                                >
                                  Save
                                </button>
                                {draft.success && <span className="text-emerald-700 text-xs">Saved</span>}
                                {draft.error && <span className="text-red-600 text-xs">{draft.error}</span>}
                              </div>
                              <div className="text-[10px] text-gray-500 mt-1">
                                Factor = ({c.target || expectedUnit || 'to'}) per 1 {c.unit || 'from'} (ingredient-specific)
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
