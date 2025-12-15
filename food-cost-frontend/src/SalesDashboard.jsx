import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SalesSparkline from './components/SalesSparkline';
import { api } from './utils/auth';

const RANGE_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 180 days', days: 180 }
];

const formatCurrency = (value) => {
  const num = Number(value || 0);
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatNumber = (value, digits = 0) => {
  const num = Number(value || 0);
  return num.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export default function SalesDashboard() {
  const [rangeDays, setRangeDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get('/api/sales/daily_summary', { params: { days: rangeDays } })
      .then((res) => {
        if (cancelled) return;
        setSummary(res.data);
      })
      .catch((err) => {
        console.error('Failed to load sales summary', err);
        if (cancelled) return;
        setError('Unable to load sales data. Please confirm that sales uploads exist for this range.');
        setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [rangeDays]);

  const highlightDays = useMemo(() => {
    const rows = Array.isArray(summary?.daily) ? summary.daily.filter((d) => d.net_sales > 0) : [];
    if (!rows.length) return { best: null, slow: null };
    const best = rows.reduce((acc, cur) => ((Number(cur.net_sales) || 0) > (Number(acc.net_sales) || 0) ? cur : acc));
    const slow = rows.reduce((acc, cur) => ((Number(cur.net_sales) || 0) < (Number(acc.net_sales) || 0) ? cur : acc));
    return { best, slow };
  }, [summary]);

  const projectedUnits = useMemo(() => {
    const avgQty = summary?.totals?.avg_qty_per_day || 0;
    return avgQty * 7;
  }, [summary]);

  const rollingAvg = useMemo(() => {
    const rows = Array.isArray(summary?.daily) ? summary.daily : [];
    if (!rows.length) return 0;
    const take = Math.min(7, rows.length);
    const slice = rows.slice(-take);
    const total = slice.reduce((acc, cur) => acc + (cur.net_sales || 0), 0);
    return total / take;
  }, [summary]);

  const trendPct = summary?.trend?.trend_pct;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Sales Insights</h1>
          <p className="text-gray-600">Understand daily performance so you can plan production and purchasing with confidence.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            className="border rounded px-3 py-2 text-sm"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.days} value={opt.days}>{opt.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Link to="/sales/upload" className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Upload Sales</Link>
            <Link to="/sales/uploads" className="px-4 py-2 rounded border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">Manage Uploads</Link>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border rounded p-8 text-center text-gray-600">Loading sales data…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">{error}</div>
      ) : !summary ? (
        <div className="bg-white border rounded p-8 text-center text-gray-600">No sales data available for the selected window.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="Net Sales" value={formatCurrency(summary?.totals?.net_sales)} sub={`Avg ${formatCurrency(summary?.totals?.avg_net_per_day)} per day`} />
            <StatCard label="Units Sold" value={formatNumber(summary?.totals?.qty_sold)} sub={`Avg ${formatNumber(summary?.totals?.avg_qty_per_day, 1)} per day`} />
            <StatCard label="Avg Ticket" value={formatCurrency(summary?.totals?.avg_ticket)} sub="Net / unit" />
            <StatCard
              label="7-day Net Avg"
              value={formatCurrency(rollingAvg)}
              sub={trendPct != null ? `${trendPct >= 0 ? '▲' : '▼'} ${Math.abs(trendPct).toFixed(1)}% vs prior week` : 'Not enough history'}
              trendPositive={trendPct != null ? trendPct >= 0 : null}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold">Daily Net Sales</h2>
                  <p className="text-sm text-gray-500">{summary.start_date} → {summary.end_date}</p>
                </div>
                <div className="text-sm text-gray-500">Total {formatCurrency(summary?.totals?.net_sales)}</div>
              </div>
              <SalesSparkline data={summary.daily} accessor="net_sales" height={80} />
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <HighlightDay title="Busiest day" day={highlightDays.best} />
                <HighlightDay title="Slowest day" day={highlightDays.slow} />
              </div>
            </div>

            <div className="bg-white rounded shadow p-6 flex flex-col gap-4">
              <h2 className="text-xl font-semibold">Production Outlook</h2>
              <div>
                <div className="text-sm text-gray-500 mb-1">Projected units needed (next 7 days)</div>
                <div className="text-3xl font-bold">{formatNumber(projectedUnits, 0)}</div>
                <p className="text-xs text-gray-500">Based on trailing daily average. Use this to prep dough, proteins, and packaging.</p>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Discount pressure</div>
                <div className="text-lg font-semibold">{formatCurrency(summary?.totals?.discounts)}</div>
                <p className="text-xs text-gray-500">Track promos and comps that affect profitability.</p>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Tax collected</div>
                <div className="text-lg font-semibold">{formatCurrency(summary?.totals?.taxes)}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded shadow p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
              <div>
                <h2 className="text-xl font-semibold">Daily Breakdown</h2>
                <p className="text-sm text-gray-500">Use this to spot weekday patterns and plan labor or purchasing.</p>
              </div>
              <div className="text-sm text-gray-600">Showing {summary.daily.length} days</div>
            </div>
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-sm">
                <thead className="text-left bg-gray-50">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Units</th>
                    <th className="px-3 py-2 text-right">Net Sales</th>
                    <th className="px-3 py-2 text-right">Avg Price</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.daily.map((day) => (
                    <tr key={day.business_date} className="border-t">
                      <td className="px-3 py-2">{new Date(day.business_date).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(day.qty_sold)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(day.net_sales)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(day.avg_item_price)}</td>
                    </tr>
                  ))}
                  {summary.daily.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-center text-gray-500" colSpan={4}>No sales data in this range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, trendPositive }) {
  let trendBadge = null;
  if (trendPositive === true) trendBadge = <span className="text-xs text-green-600 ml-1">▲</span>;
  if (trendPositive === false) trendBadge = <span className="text-xs text-red-600 ml-1">▼</span>;
  return (
    <div className="bg-white rounded shadow p-4">
      <div className="text-sm uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 flex items-center">{value}{trendBadge}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function HighlightDay({ title, day }) {
  if (!day) {
    return (
      <div className="border rounded p-3 text-sm text-gray-500">
        <div className="font-semibold text-gray-700">{title}</div>
        <div>No history yet.</div>
      </div>
    );
  }
  return (
    <div className="border rounded p-3">
      <div className="text-xs uppercase text-gray-500">{title}</div>
      <div className="text-lg font-semibold">{new Date(day.business_date).toLocaleDateString()}</div>
      <div className="text-sm text-gray-600">{formatCurrency(day.net_sales)} • {formatNumber(day.qty_sold)} units</div>
    </div>
  );
}
