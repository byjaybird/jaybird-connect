import React, { useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { api } from './utils/auth';

const numberOrBlank = (val) => {
  if (val === null || val === undefined) return '';
  return isNaN(val) ? val : Number(val);
};

export default function SalesDayReview() {
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState({});
  const [saving, setSaving] = useState({});
  const [filterUnmapped, setFilterUnmapped] = useState(false);

  const load = async (date) => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      const [linesRes, itemsRes] = await Promise.all([
        api.get('/api/sales/lines', { params: { business_date: date, limit: 5000 } }),
        api.get('/api/items')
      ]);
      setLines(Array.isArray(linesRes.data) ? linesRes.data : []);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setDirty({});
    } catch (err) {
      console.error('Failed to load day review data', err);
      const msg = err?.response?.data?.error || err.message || 'Failed to load sales lines';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(businessDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessDate]);

  const handleFieldChange = (lineId, field, value) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, [field]: value } : l)));
    setDirty((prev) => ({ ...prev, [lineId]: true }));
  };

  const saveLine = async (line) => {
    setSaving((prev) => ({ ...prev, [line.id]: true }));
    try {
      const payload = {
        item_id: line.item_id || null,
        item_name: line.item_name,
        sales_category: line.sales_category,
        item_qty: line.item_qty,
        net_sales: line.net_sales,
        discount_amount: line.discount_amount,
        gross_sales: line.gross_sales,
        tax_amount: line.tax_amount
      };
      const res = await api.put(`/api/sales/lines/${line.id}`, payload);
      const updated = res?.data?.line || line;
      setLines((prev) => prev.map((l) => (l.id === line.id ? updated : l)));
      setDirty((prev) => {
        const next = { ...prev };
        delete next[line.id];
        return next;
      });
    } catch (err) {
      console.error('Failed to save line', err);
      const msg = err?.response?.data?.error || err.message || 'Save failed';
      alert(msg);
    } finally {
      setSaving((prev) => {
        const next = { ...prev };
        delete next[line.id];
        return next;
      });
    }
  };

  const totals = useMemo(() => {
    return (lines || []).reduce(
      (acc, l) => {
        acc.qty += Number(l.item_qty || 0);
        acc.net += Number(l.net_sales || 0);
        acc.gross += Number(l.gross_sales || 0);
        acc.discounts += Number(l.discount_amount || 0);
        acc.tax += Number(l.tax_amount || 0);
        return acc;
      },
      { qty: 0, net: 0, gross: 0, discounts: 0, tax: 0 }
    );
  }, [lines]);

  const visibleLines = useMemo(() => {
    if (!filterUnmapped) return lines;
    return lines.filter((l) => !l.item_id);
  }, [filterUnmapped, lines]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Daily Sales Review</h1>
          <p className="text-gray-600 text-sm">Inspect and adjust individual product mix lines for a day.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700">
            Date:{' '}
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filterUnmapped}
              onChange={(e) => setFilterUnmapped(e.target.checked)}
            />
            Show unmapped only
          </label>
          <button
            onClick={() => load(businessDate)}
            className="bg-gray-100 px-3 py-2 rounded text-sm border border-gray-200"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>}
      {loading && <div className="bg-white border rounded p-4">Loading sales lines…</div>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-white border rounded p-4 shadow-sm">
            <Stat label="Lines" value={visibleLines.length} />
            <Stat label="Qty sold" value={totals.qty.toFixed(2)} />
            <Stat label="Net sales" value={`$${totals.net.toFixed(2)}`} />
            <Stat label="Gross sales" value={`$${totals.gross.toFixed(2)}`} />
            <Stat label="Discounts" value={`$${totals.discounts.toFixed(2)}`} />
          </div>

          <div className="bg-white shadow rounded overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Item name</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">Tax</th>
                  <th className="px-3 py-2">Mapped item</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((l, idx) => {
                  const itemValue = l.item_id
                    ? { value: l.item_id, label: items.find((it) => it.item_id === l.item_id)?.name || l.item_id }
                    : null;
                  const isDirty = !!dirty[l.id];
                  return (
                    <tr key={l.id} className="border-t align-top">
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input
                          value={l.item_name || ''}
                          onChange={(e) => handleFieldChange(l.id, 'item_name', e.target.value)}
                          className="w-full border rounded px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={l.sales_category || ''}
                          onChange={(e) => handleFieldChange(l.id, 'sales_category', e.target.value)}
                          className="w-full border rounded px-2 py-1"
                          placeholder="Category"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={numberOrBlank(l.item_qty)}
                          onChange={(e) => handleFieldChange(l.id, 'item_qty', e.target.value)}
                          className="w-24 border rounded px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={numberOrBlank(l.net_sales)}
                          onChange={(e) => handleFieldChange(l.id, 'net_sales', e.target.value)}
                          className="w-28 border rounded px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={numberOrBlank(l.gross_sales)}
                          onChange={(e) => handleFieldChange(l.id, 'gross_sales', e.target.value)}
                          className="w-28 border rounded px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={numberOrBlank(l.discount_amount)}
                          onChange={(e) => handleFieldChange(l.id, 'discount_amount', e.target.value)}
                          className="w-28 border rounded px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={numberOrBlank(l.tax_amount)}
                          onChange={(e) => handleFieldChange(l.id, 'tax_amount', e.target.value)}
                          className="w-24 border rounded px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 min-w-[220px]">
                        <Select
                          value={itemValue}
                          onChange={(selected) => handleFieldChange(l.id, 'item_id', selected ? selected.value : null)}
                          options={items.map((it) => ({ value: it.item_id, label: it.name }))}
                          classNamePrefix="react-select"
                          placeholder="Map to item"
                          isClearable
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => saveLine(l)}
                          disabled={saving[l.id]}
                          className={`px-3 py-1 rounded text-sm ${isDirty ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                          {saving[l.id] ? 'Saving…' : isDirty ? 'Save' : 'Saved'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visibleLines.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-center text-gray-600" colSpan={10}>
                      No lines for this day.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}
