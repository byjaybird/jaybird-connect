import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from './utils/auth';

const UPLOADS = [
  { key: 'payments_summary', label: 'Payments summary.csv', description: 'Single upload to populate tips, tax, gift cards sold, and deposits per tender.' }
];

function UploadTile({ type, label, description, businessDate, onUploaded }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      setStatus({ error: 'Choose a CSV first.' });
      return;
    }
    setLoading(true);
    setStatus(null);
    const form = new FormData();
    form.append('file', file);
    form.append('business_date', businessDate);
    try {
      const res = await api.post(`/api/journal/upload/${type}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setStatus({ ok: true, rows: res?.data?.rows, warnings: res?.data?.warnings });
      onUploaded?.();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Upload failed';
      setStatus({ error: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-semibold text-gray-800">{label}</div>
          <div className="text-xs text-gray-500">{description}</div>
        </div>
        <span className="text-xs uppercase text-gray-500 bg-gray-100 px-2 py-1 rounded">{type}</span>
      </div>
      <div className="flex items-center gap-3">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
        <button onClick={handleUpload} disabled={loading} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
          {loading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {status?.error && <div className="mt-2 text-sm text-red-600">{status.error}</div>}
      {status?.ok && (
        <div className="mt-2 text-sm text-green-700">
          Uploaded {status.rows ?? 0} rows.
          {(status.warnings || []).length > 0 && (
            <div className="text-amber-700">Warnings: {(status.warnings || []).map((w, idx) => w.message || w.code || idx).join(', ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

function SalesUploadBox({ businessDate, onUploaded }) {
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) {
      setError('Please select a CSV file to upload.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    if (businessDate) form.append('business_date', businessDate);
    if (notes) form.append('notes', notes);
    setIsSubmitting(true);
    try {
      const resp = await api.post('/api/sales/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(resp.data);
      onUploaded?.();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Upload failed';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border rounded p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-semibold text-gray-800">Upload Sales (PMIX)</div>
          <div className="text-xs text-gray-500">Toast Product Mix CSV for the business day.</div>
        </div>
        <span className="text-xs uppercase text-gray-500 bg-gray-100 px-2 py-1 rounded">sales</span>
      </div>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
      {result && (
        <div className="mb-2 text-sm text-green-700">
          Upload successful - ID {result.upload_id}, rows {result.rows}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center gap-3">
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
          <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
            {isSubmitting ? 'Uploading...' : 'Upload Sales'}
          </button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" rows={2} />
        </div>
      </form>
    </div>
  );
}

function WarningList({ warnings = [] }) {
  if (!warnings.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3">
      <div className="font-semibold mb-1">Warnings</div>
      <ul className="list-disc pl-5 text-sm space-y-1">
        {warnings.map((w, idx) => (
          <li key={idx}>
            <span className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded mr-2">{w.severity || 'warn'}</span>
            {w.message || w.code}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Table({ title, rows = [], columns }) {
  if (!rows.length) return null;
  return (
    <div className="bg-white shadow rounded mt-4">
      <div className="px-4 py-2 border-b font-semibold text-gray-800">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2">{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CloseoutPage() {
  const params = useParams();
  const navigate = useNavigate();
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [businessDate, setBusinessDate] = useState(params.date || todayIso);
  const [packet, setPacket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validation, setValidation] = useState(null);
  const [locking, setLocking] = useState(false);
  const [salesUploads, setSalesUploads] = useState([]);
  const [salesError, setSalesError] = useState(null);
  const [journalUploads, setJournalUploads] = useState([]);
  const [journalError, setJournalError] = useState(null);
  const [selectedJournalUpload, setSelectedJournalUpload] = useState(null);

  useEffect(() => {
    navigate(`/closeout/${businessDate}`, { replace: true });
    loadPacket(businessDate);
    loadSalesUploads(businessDate);
    loadJournalUploads(businessDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessDate]);

  const loadPacket = async (date) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/journal/daily', { params: { business_date: date } });
      setPacket(res.data);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Failed to load packet';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    setValidation(null);
    try {
      const res = await api.post('/api/journal/validate', { business_date: businessDate });
      setValidation(res.data);
    } catch (err) {
      setValidation({ error: err?.response?.data?.error || err.message });
    }
  };

  const handleLock = async () => {
    setLocking(true);
    try {
      await api.post('/api/journal/lock', { business_date: businessDate });
      await loadPacket(businessDate);
    } catch (err) {
      alert(err?.response?.data?.error || err.message || 'Failed to lock day');
    } finally {
      setLocking(false);
    }
  };

  const handleUploaded = () => {
    loadPacket(businessDate);
    loadSalesUploads(businessDate);
    loadJournalUploads(businessDate);
  };

  const journalLines = packet?.journal_lines_ready_for_xero || [];

  const loadSalesUploads = async (date) => {
    try {
      const res = await api.get('/api/sales/uploads', { params: { business_date: date } });
      setSalesUploads(Array.isArray(res.data) ? res.data : []);
      setSalesError(null);
    } catch (err) {
      console.error('Failed to load sales uploads', err);
      setSalesError('Could not load sales uploads');
    }
  };

  const loadJournalUploads = async (date) => {
    try {
      const res = await api.get('/api/journal/uploads', { params: { business_date: date } });
      setJournalUploads(Array.isArray(res.data) ? res.data : []);
      setJournalError(null);
    } catch (err) {
      console.error('Failed to load journal uploads', err);
      setJournalError('Could not load payments uploads');
    }
  };

  const openJournalUpload = async (id) => {
    try {
      const res = await api.get(`/api/journal/uploads/${id}`);
      setSelectedJournalUpload(res.data);
    } catch (err) {
      alert('Failed to load upload detail');
    }
  };

  const reverseJournalUpload = async (id) => {
    if (!id) return;
    if (!window.confirm('Reverse (delete) this payments summary upload?')) return;
    try {
      await api.post(`/api/journal/uploads/${id}/reverse`);
      setSelectedJournalUpload(null);
      handleUploaded();
    } catch (err) {
      alert(err?.response?.data?.error || err.message || 'Failed to reverse upload');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Daily Closeout</h1>
          <p className="text-gray-600">Upload Toast exports and preview the Smart Journal Packet for Xero.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="border rounded px-3 py-2"
            aria-label="Business date"
          />
          <button onClick={() => loadPacket(businessDate)} className="bg-gray-100 px-3 py-2 rounded text-sm">Refresh</button>
        </div>
      </div>

      {error && <div className="text-red-600">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {UPLOADS.map((u) => (
          <UploadTile key={u.key} type={u.key} label={u.label} description={u.description} businessDate={businessDate} onUploaded={handleUploaded} />
        ))}
      </div>

      <SalesUploadBox businessDate={businessDate} onUploaded={handleUploaded} />

      <div className="bg-white shadow rounded mt-4">
        <div className="px-4 py-2 border-b font-semibold text-gray-800 flex justify-between items-center">
          <span>Sales uploads for {businessDate}</span>
          <Link to="/sales/uploads" className="text-blue-600 text-sm underline">Manage all uploads</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Upload ID</th>
                <th className="px-3 py-2">Rows</th>
                <th className="px-3 py-2">Filename</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {(salesUploads || []).map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link to={`/sales/${u.id}`} className="text-blue-600 underline">#{u.id}</Link>
                  </td>
                  <td className="px-3 py-2">{u.row_count}</td>
                  <td className="px-3 py-2">{u.source_filename}</td>
                  <td className="px-3 py-2">{u.created_at ? new Date(u.created_at).toLocaleString() : ''}</td>
                </tr>
              ))}
              {(salesUploads || []).length === 0 && (
                <tr>
                  <td className="px-3 py-2" colSpan={4}>No sales uploads yet for this date.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white shadow rounded mt-4">
        <div className="px-4 py-2 border-b font-semibold text-gray-800">Payments summary uploads</div>
        {journalError && <div className="text-sm text-red-600 px-4 py-2">{journalError}</div>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Upload ID</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Rows</th>
                <th className="px-3 py-2">Filename</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(journalUploads || []).map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">#{u.id}</td>
                  <td className="px-3 py-2">{u.upload_type}</td>
                  <td className="px-3 py-2">{u.row_count}</td>
                  <td className="px-3 py-2">{u.source_filename}</td>
                  <td className="px-3 py-2">{u.created_at ? new Date(u.created_at).toLocaleString() : ''}</td>
                  <td className="px-3 py-2">
                    <button className="text-blue-600 underline text-sm mr-2" onClick={() => openJournalUpload(u.id)}>View</button>
                    <button className="text-red-600 underline text-sm" onClick={() => reverseJournalUpload(u.id)}>Reverse</button>
                  </td>
                </tr>
              ))}
              {(journalUploads || []).length === 0 && (
                <tr>
                  <td className="px-3 py-2" colSpan={6}>No payments summary uploads yet for this date. Manage all at <Link to="/payments/uploads" className="text-blue-600 underline">Payments uploads</Link>.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {selectedJournalUpload && (
          <div className="border-t px-4 py-3 text-sm bg-gray-50">
            <div className="flex justify-between items-center">
              <div className="font-semibold">Upload #{selectedJournalUpload.id} ({selectedJournalUpload.upload_type})</div>
              <button className="text-sm text-blue-600 underline" onClick={() => setSelectedJournalUpload(null)}>Close</button>
            </div>
            <pre className="mt-2 bg-black text-green-100 text-xs p-3 rounded overflow-x-auto max-h-96">{JSON.stringify(selectedJournalUpload, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleValidate} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm">Validate</button>
        <button onClick={handleLock} disabled={locking} className="bg-emerald-600 text-white px-4 py-2 rounded text-sm">
          {locking ? 'Locking...' : 'Lock Day'}
        </button>
        {packet?.status === 'locked' && <span className="text-green-700 text-sm font-semibold">Day locked</span>}
      </div>

      {validation && (
        <div className="bg-white border rounded p-3 shadow">
          <div className="font-semibold mb-1">Validation</div>
          {validation.error && <div className="text-red-600">{validation.error}</div>}
          <WarningList warnings={(validation.blocking || []).concat(validation.warnings || [])} />
        </div>
      )}

      {loading && <div>Loading packet...</div>}
      {packet && !loading && (
        <>
          <WarningList warnings={packet.warnings || []} />

          <Table
            title="Revenue by Category"
            rows={packet.revenue || []}
            columns={[
              { key: 'category', label: 'Category', render: (r) => (r.category || '').toString().toUpperCase() },
              { key: 'net_sales', label: 'Net Sales', render: (r) => `$${Number(r.net_sales || 0).toFixed(2)}` },
              { key: 'gross_sales', label: 'Gross', render: (r) => `$${Number(r.gross_sales || 0).toFixed(2)}` },
              { key: 'discounts', label: 'Discounts', render: (r) => `$${Number(r.discounts || 0).toFixed(2)}` }
            ]}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white shadow rounded p-4">
              <div className="font-semibold text-gray-800 mb-2">Liabilities</div>
              <ul className="space-y-1 text-sm">
                <li>Tips incurred: ${Number(packet.liabilities?.tips_incurred || 0).toFixed(2)}</li>
                <li>Tips paid: ${Number(packet.liabilities?.tips_paid || 0).toFixed(2)}</li>
                <li>Auto grat: ${Number(packet.liabilities?.auto_grat || 0).toFixed(2)}</li>
                <li>Sales tax: ${Number(packet.liabilities?.tax_collected || 0).toFixed(2)}</li>
                <li>Gift cards sold: ${Number(packet.liabilities?.giftcard_sold || 0).toFixed(2)}</li>
                <li>Gift cards redeemed: ${Number(packet.liabilities?.giftcard_redeemed || 0).toFixed(2)}</li>
              </ul>
            </div>
            <div className="bg-white shadow rounded p-4">
              <div className="font-semibold text-gray-800 mb-2">Expected Deposits</div>
              {(packet.expected_deposits || []).map((d, idx) => (
                <div key={idx} className="text-sm flex justify-between border-b py-1">
                  <span className="uppercase">{d.tender}</span>
                  <span className="font-semibold">${Number(d.expected || 0).toFixed(2)}</span>
                </div>
              ))}
              {packet.fees && <div className="text-xs text-gray-500 mt-2">Processing fees: ${Number(packet.fees.processing_fees || 0).toFixed(2)}</div>}
            </div>
          </div>

          <div className="bg-white shadow rounded mt-4">
            <div className="px-4 py-2 border-b font-semibold text-gray-800">Journal Entry Preview</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {journalLines.map((line, idx) => {
                    const amt = Number(line.amount || 0);
                    const isDebit = (line.type || '').toLowerCase() === 'debit';
                    return (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-2">{line.account}</td>
                        <td className="px-3 py-2 text-right">{isDebit ? `$${amt.toFixed(2)}` : ''}</td>
                        <td className="px-3 py-2 text-right">{!isDebit ? `$${amt.toFixed(2)}` : ''}</td>
                      </tr>
                    );
                  })}
                  {journalLines.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-center text-gray-500" colSpan={3}>No journal lines yet.</td>
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
