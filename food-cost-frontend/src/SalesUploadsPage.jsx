import React, { useEffect, useState } from 'react';
import { api } from './utils/auth';
import { Link } from 'react-router-dom';

export default function SalesUploadsPage() {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [reversingId, setReversingId] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const resp = await api.get('/api/sales/uploads');
        if (!mounted) return;
        setUploads(Array.isArray(resp.data) ? resp.data : []);
      } catch (err) {
        console.error('Failed to load uploads', err);
        setError('Failed to load uploads');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const reverseUpload = async (id) => {
    const confirm = window.confirm('Are you sure you want to reverse this upload? This will delete all rows associated with it.');
    if (!confirm) return;
    setError(null);
    setMessage(null);
    setReversingId(id);
    try {
      const resp = await api.post(`/api/sales/uploads/${id}/reverse`);
      const deletedLines = resp?.data?.deleted_lines;
      setUploads((prev) => prev.filter(u => u.id !== id));
      setMessage(`Upload ${id} reversed${deletedLines ? ` (${deletedLines} lines deleted)` : ''}.`);
    } catch (err) {
      console.error('Failed to reverse upload', err);
      const msg = err?.response?.data?.error || err.message || 'Failed to reverse upload';
      setError(msg);
    } finally {
      setReversingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sales Uploads</h1>
          <p className="text-gray-600">Review and troubleshoot daily Toast exports that power the dashboard.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/sales" className="bg-gray-100 text-gray-800 px-4 py-2 rounded border border-gray-200 hover:bg-gray-200">Sales Dashboard</Link>
          <Link to="/sales/upload" className="bg-blue-600 text-white px-4 py-2 rounded">Upload CSV</Link>
        </div>
      </div>

      {loading && <div>Loading...</div>}
      {error && <div className="text-red-600">{error}</div>}
      {message && <div className="text-green-700 bg-green-100 border border-green-200 px-3 py-2 rounded mb-3">{message}</div>}

      {!loading && !error && (
        <div className="bg-white shadow rounded">
          <table className="min-w-full table-auto">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">Filename</th>
                <th className="px-4 py-2 text-left">Business Date</th>
                <th className="px-4 py-2 text-left">Rows</th>
                <th className="px-4 py-2 text-left">Created At</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2">{u.id}</td>
                  <td className="px-4 py-2">{u.source_filename}</td>
                  <td className="px-4 py-2">{u.business_date}</td>
                  <td className="px-4 py-2">{u.row_count}</td>
                  <td className="px-4 py-2">{new Date(u.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-3 items-center">
                      <Link className="text-blue-600 hover:underline" to={`/sales/${u.id}`}>View</Link>
                      <button
                        onClick={() => reverseUpload(u.id)}
                        disabled={reversingId === u.id}
                        className="text-red-600 hover:underline disabled:opacity-50"
                      >
                        {reversingId === u.id ? 'Reversing...' : 'Reverse'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {uploads.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-600">No uploads found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
