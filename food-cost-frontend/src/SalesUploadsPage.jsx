import React, { useEffect, useState } from 'react';
import { api } from './utils/auth';
import { Link } from 'react-router-dom';

export default function SalesUploadsPage() {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sales Uploads</h1>
          <p className="text-gray-600">Previously uploaded sales files</p>
        </div>
        <div>
          <Link to="/sales/upload" className="bg-blue-600 text-white px-4 py-2 rounded">Upload CSV</Link>
        </div>
      </div>

      {loading && <div>Loading...</div>}
      {error && <div className="text-red-600">{error}</div>}

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
                  <td className="px-4 py-2"><Link to={`/sales/${u.id}`}>View</Link></td>
                </tr>
              ))}
              {uploads.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-600">No uploads found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
