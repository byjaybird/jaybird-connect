import React, { useEffect, useState } from 'react';
import { api } from './utils/auth';

export default function PaymentsUploadsPage() {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [businessDate, setBusinessDate] = useState('');
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/journal/uploads', {
        params: businessDate ? { business_date: businessDate } : {}
      });
      setUploads(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Failed to load uploads';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewUpload = async (id) => {
    try {
      const res = await api.get(`/api/journal/uploads/${id}`);
      setSelected(res.data);
    } catch (err) {
      alert('Failed to load upload detail');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payments summary uploads</h1>
          <p className="text-gray-600 text-sm">Review and inspect payments summary files used for daily close.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            aria-label="Business date filter"
          />
          <button onClick={load} className="bg-gray-100 px-3 py-2 rounded text-sm">Apply</button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading && <div>Loading uploads...</div>}

      <div className="bg-white shadow rounded">
        <div className="px-4 py-2 border-b font-semibold text-gray-800">Uploads</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Business Date</th>
                <th className="px-3 py-2">Rows</th>
                <th className="px-3 py-2">Filename</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(uploads || []).map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">#{u.id}</td>
                  <td className="px-3 py-2">{u.upload_type}</td>
                  <td className="px-3 py-2">{u.business_date}</td>
                  <td className="px-3 py-2">{u.row_count}</td>
                  <td className="px-3 py-2">{u.source_filename}</td>
                  <td className="px-3 py-2">{u.created_at ? new Date(u.created_at).toLocaleString() : ''}</td>
                  <td className="px-3 py-2">
                    <button className="text-blue-600 underline text-sm" onClick={() => viewUpload(u.id)}>View</button>
                  </td>
                </tr>
              ))}
              {(uploads || []).length === 0 && (
                <tr>
                  <td className="px-3 py-2" colSpan={7}>No uploads found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="bg-white shadow rounded">
          <div className="px-4 py-2 border-b flex justify-between items-center">
            <div className="font-semibold text-gray-800">Upload #{selected.id} ({selected.upload_type})</div>
            <button className="text-sm text-blue-600 underline" onClick={() => setSelected(null)}>Close</button>
          </div>
          <pre className="bg-black text-green-100 text-xs p-3 rounded overflow-x-auto max-h-96">{JSON.stringify(selected, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
