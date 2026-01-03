import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SalesSparkline from './components/SalesSparkline';
import { api } from './utils/auth';

const RANGE_OPTIONS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last 90 days', days: 90 }
];

const formatCurrency = (value) => {
  const num = Number(value || 0);
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatNumber = (value, digits = 0) => {
  const num = Number(value || 0);
  return num.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const pct = (num) => (num == null ? '—' : `${num > 0 ? '▲' : num < 0 ? '▼' : '•'} ${Math.abs(num).toFixed(1)}%`);

function Prices() {
  const [days, setDays] = useState(30);
  const [dashboard, setDashboard] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editQuote, setEditQuote] = useState(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [errorDash, setErrorDash] = useState(null);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoadingDash(true);
    setErrorDash(null);
    api.get('/api/prices/margin_dashboard', { params: { days }, timeout: 30000 })
      .then((res) => {
        if (cancelled) return;
        setDashboard(res.data);
      })
      .catch((err) => {
        console.error('Failed to load margin dashboard', err);
        if (cancelled) return;
        setDashboard(null);
        setErrorDash('Unable to load margin data. Check that sales uploads exist and items are mapped.');
      })
      .finally(() => {
        if (!cancelled) setLoadingDash(false);
      });
    return () => { cancelled = true; };
  }, [days]);

  useEffect(() => {
    let mounted = true;
    setLoadingQuotes(true);
    async function load() {
      try {
        const res = await api.get('/api/price_quotes');
        if (!mounted) return;
        const data = res.data;
        if (Array.isArray(data)) setQuotes(data);
        else if (Array.isArray(data.price_quotes)) setQuotes(data.price_quotes);
        else if (Array.isArray(data.quotes)) setQuotes(data.quotes);
        else setQuotes([]);
      } catch (err) {
        console.error('Failed to load price quotes', err);
        setQuotes([]);
      } finally {
        if (mounted) setLoadingQuotes(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [navigate]);

  const startEdit = (idx) => {
    setEditingIdx(idx);
    setEditQuote({ ...quotes[idx] });
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditQuote(null);
  };

  const saveEdit = async () => {
    if (!editQuote) return;
    try {
      const payload = {
        ingredient_id: editQuote.ingredient_id,
        source: editQuote.source,
        size_qty: parseFloat(editQuote.size_qty),
        size_unit: editQuote.size_unit,
        price: parseFloat(editQuote.price),
        date_found: editQuote.date_found,
        notes: editQuote.notes,
        is_purchase: !!editQuote.is_purchase
      };
      const res = await api.put(`/api/price_quotes/${editQuote.id}`, payload);
      if (res.data && res.status === 200) {
        const updated = [...quotes];
        updated[editingIdx] = res.data;
        setQuotes(updated);
        setEditingIdx(null);
        setEditQuote(null);
      } else {
        alert('Failed to save price quote');
      }
    } catch (err) {
      alert('Failed to save price quote');
    }
  };

  const netDeltaPct = useMemo(() => {
    if (!dashboard?.summary || dashboard?.prior_summary?.net_sales == null) return null;
    const prior = Number(dashboard.prior_summary.net_sales || 0);
    if (!prior) return null;
    const curr = Number(dashboard.summary.net_sales || 0);
    return ((curr - prior) / prior) * 100;
  }, [dashboard]);

  const marginDeltaPct = useMemo(() => {
    if (dashboard?.summary?.margin == null || dashboard?.prior_summary?.margin == null) return null;
    const curr = Number(dashboard.summary.margin || 0);
    const prior = Number(dashboard.prior_summary.margin || 0);
    if (!prior) return null;
    return ((curr - prior) / prior) * 100;
  }, [dashboard]);

  const items = useMemo(() => {
    const rows = Array.isArray(dashboard?.items) ? [...dashboard.items] : [];
    return rows.sort((a, b) => (Number(b.net_sales || 0) - Number(a.net_sales || 0)));
  }, [dashboard]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Prices & Margins</h1>
          <p className="text-gray-600">Track realized price, discounts, and menu-level margins using recipe costs.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            className="border rounded px-3 py-2 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.days} value={opt.days}>{opt.label}</option>
            ))}
          </select>
          <Link
            to="/prices/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-semibold"
          >
            Add Quote
          </Link>
          <Link
            to="/receiving/new"
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-semibold"
          >
            Receive Goods
          </Link>
          <Link
            to="/sales/upload"
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold"
          >
            Upload Sales
          </Link>
        </div>
      </div>

      {loadingDash ? (
        <div className="bg-white border rounded p-6 text-gray-600">Loading margin dashboard…</div>
      ) : errorDash ? (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">{errorDash}</div>
      ) : !dashboard ? (
        <div className="bg-white border rounded p-6 text-gray-600">No margin data available.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Margin %" value={dashboard.summary?.margin_pct != null ? `${dashboard.summary.margin_pct.toFixed(1)}%` : '—'} sub={dashboard.summary?.avg_margin_per_unit != null ? `Avg ${formatCurrency(dashboard.summary.avg_margin_per_unit)} / unit` : 'Need costs mapped'} />
            <StatCard label="Margin $" value={formatCurrency(dashboard.summary?.margin)} sub={marginDeltaPct != null ? pct(marginDeltaPct) + ' vs prior' : 'Current window'} />
            <StatCard label="Net Sales" value={formatCurrency(dashboard.summary?.net_sales)} sub={netDeltaPct != null ? pct(netDeltaPct) + ' vs prior' : 'Current window'} />
            <StatCard label="Discount rate" value={dashboard.summary?.discount_rate_pct != null ? `${dashboard.summary.discount_rate_pct.toFixed(1)}%` : '—'} sub={formatCurrency(dashboard.summary?.discounts) + ' discounts'} />
            <StatCard label="Avg realized price" value={formatCurrency(dashboard.summary?.avg_price)} sub={`${formatNumber(dashboard.summary?.qty)} units`} />
            <StatCard label="Mapping coverage" value={dashboard.mapping?.mapping_rate_pct != null ? `${dashboard.mapping.mapping_rate_pct.toFixed(1)}%` : '—'} sub={`${dashboard.mapping?.mapped_rows || 0} mapped / ${dashboard.mapping?.unmapped_rows || 0} unmapped`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold">Trend ({dashboard.window?.start_date} → {dashboard.window?.end_date})</h2>
                  <p className="text-sm text-gray-500">Net sales and margin over time.</p>
                </div>
                <div className="text-sm text-gray-600">Current vs prior window of {days} days</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500 mb-2">Net sales</div>
                  <SalesSparkline data={dashboard.daily} accessor="net_sales" height={80} stroke="#2563eb" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-2">Margin</div>
                  <SalesSparkline data={dashboard.daily} accessor="margin" height={80} stroke="#16a34a" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded shadow p-6 space-y-4">
              <h2 className="text-xl font-semibold">Issues to fix</h2>
              <div>
                <div className="text-sm font-semibold text-gray-800 mb-1">Unmapped sales</div>
                {dashboard.unmapped?.length ? (
                  <ul className="text-sm text-gray-700 space-y-1">
                    {dashboard.unmapped.slice(0, 6).map((u) => (
                      <li key={u.name} className="flex justify-between">
                        <span>{u.name}</span>
                        <span className="text-gray-500">{formatCurrency(u.net_sales)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-gray-500">All mapped.</div>}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800 mb-1">Missing cost</div>
                {dashboard.missing_cost_items?.length ? (
                  <ul className="text-sm text-gray-700 space-y-1">
                    {dashboard.missing_cost_items.slice(0, 6).map((m) => (
                      <li key={`${m.item_id}-${m.name}`} className="flex justify-between">
                        <Link to={`/item/${m.item_id || ''}`} className="text-blue-600 underline">
                          {m.name || 'Unknown item'}
                        </Link>
                        <span className="text-gray-500">{formatCurrency(m.net_sales)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-gray-500">All costed.</div>}
              </div>
            </div>
          </div>

          <div className="bg-white rounded shadow p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
              <div>
                <h2 className="text-xl font-semibold">Items</h2>
                <p className="text-sm text-gray-500">Sorted by net sales for this window.</p>
              </div>
              <div className="text-sm text-gray-600">{items.length} items</div>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left bg-gray-50">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-right">Units</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-right">Avg Price</th>
                    <th className="px-3 py-2 text-right">Cost/Unit</th>
                    <th className="px-3 py-2 text-right">Margin/Unit</th>
                    <th className="px-3 py-2 text-right">Margin%</th>
                    <th className="px-3 py-2 text-right">Margin $</th>
                    <th className="px-3 py-2 text-right">Discount %</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={`${it.item_id || 'unmapped'}-${it.name}`} className="border-t">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {it.item_id ? (
                            <Link to={`/item/${it.item_id}`} className="text-blue-600 underline">{it.name}</Link>
                          ) : (
                            <span>{it.name}</span>
                          )}
                          {it.item_id == null && <Badge color="yellow">Unmapped</Badge>}
                          {it.cost_per_unit == null && it.item_id != null && <Badge color="red">Missing cost</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{it.category}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(it.qty)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(it.net_sales)}</td>
                      <td className="px-3 py-2 text-right">{it.realized_price != null ? formatCurrency(it.realized_price) : '—'}</td>
                      <td className="px-3 py-2 text-right">{it.cost_per_unit != null ? formatCurrency(it.cost_per_unit) : '—'}</td>
                      <td className="px-3 py-2 text-right">{it.margin_per_unit != null ? formatCurrency(it.margin_per_unit) : '—'}</td>
                      <td className="px-3 py-2 text-right">{it.margin_pct != null ? `${it.margin_pct.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2 text-right">{it.margin_total != null ? formatCurrency(it.margin_total) : '—'}</td>
                      <td className="px-3 py-2 text-right">{it.discount_rate_pct != null ? `${it.discount_rate_pct.toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-center text-gray-500" colSpan={10}>No items found for this window.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded shadow p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold">Categories</h3>
                  <p className="text-sm text-gray-500">Top categories by net sales.</p>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left bg-gray-50">
                    <tr>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2 text-right">Units</th>
                      <th className="px-3 py-2 text-right">Net</th>
                      <th className="px-3 py-2 text-right">Discounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard.categories || []).map((c) => (
                      <tr key={c.category} className="border-t">
                        <td className="px-3 py-2">{c.category}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(c.qty)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(c.net_sales)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(c.discounts)}</td>
                      </tr>
                    ))}
                    {(!dashboard.categories || dashboard.categories.length === 0) && (
                      <tr>
                        <td className="px-3 py-4 text-center text-gray-500" colSpan={4}>No category data.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded shadow p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold">Recent price quotes</h3>
                  <p className="text-sm text-gray-500">Keep inputs fresh to improve margin accuracy.</p>
                </div>
              </div>
              {loadingQuotes ? (
                <div className="text-sm text-gray-600">Loading quotes…</div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left bg-gray-50">
                      <tr>
                        <th className="px-3 py-2">Ingredient</th>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Notes</th>
                        <th className="px-3 py-2">Purchased</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {quotes.slice(0, 10).map((q, idx) => (
                        <tr key={q.id} className="hover:bg-gray-50">
                          {editingIdx === idx ? (
                            <>
                              <td className="px-3 py-2">
                                <input type="text" value={editQuote.ingredient_name} disabled className="border rounded px-2 py-1 text-sm w-32 bg-gray-100" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="text" value={editQuote.source} onChange={e => setEditQuote(q => ({ ...q, source: e.target.value }))} className="border rounded px-2 py-1 text-sm w-32" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" value={editQuote.size_qty} onChange={e => setEditQuote(q => ({ ...q, size_qty: e.target.value }))} className="border rounded px-2 py-1 text-sm w-20" />
                                <input type="text" value={editQuote.size_unit} onChange={e => setEditQuote(q => ({ ...q, size_unit: e.target.value }))} className="border rounded px-2 py-1 text-sm w-20 ml-2" />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input type="number" value={editQuote.price} onChange={e => setEditQuote(q => ({ ...q, price: e.target.value }))} className="border rounded px-2 py-1 text-sm w-24 text-right" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="date" value={editQuote.date_found?.slice(0,10) || ''} onChange={e => setEditQuote(q => ({ ...q, date_found: e.target.value }))} className="border rounded px-2 py-1 text-sm w-32" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="text" value={editQuote.notes || ''} onChange={e => setEditQuote(q => ({ ...q, notes: e.target.value }))} className="border rounded px-2 py-1 text-sm w-32" />
                              </td>
                              <td className="px-3 py-2">
                                <select value={editQuote.is_purchase ? 'yes' : 'no'} onChange={e => setEditQuote(q => ({ ...q, is_purchase: e.target.value === 'yes' }))} className="border rounded px-2 py-1 text-sm">
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                </select>
                              </td>
                              <td className="px-3 py-2 space-x-2">
                                <button onClick={saveEdit} className="text-green-600">Save</button>
                                <button onClick={cancelEdit} className="text-gray-500">Cancel</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                                {q.ingredient_name}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                                {q.source}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                                {q.size_qty} {q.size_unit}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                                ${q.price?.toFixed ? q.price.toFixed(2) : q.price}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                                {q.date_found ? new Date(q.date_found).toLocaleDateString() : ''}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-900">
                                {q.notes}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                                {q.is_purchase ? (
                                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                    Yes
                                  </span>
                                ) : (
                                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                    No
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <button onClick={() => startEdit(idx)} className="text-blue-600 mr-2">Edit</button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                      {quotes.length === 0 && (
                        <tr>
                          <td className="px-3 py-4 text-center text-gray-500" colSpan={8}>No price quotes yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded shadow p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Badge({ children, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800'
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
}

export default Prices;
