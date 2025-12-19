import React, { useState } from 'react';
import { api } from './utils/auth';
import { useNavigate } from 'react-router-dom';

function SalesUpload() {
  const [file, setFile] = useState(null);
  // Default to today so users don't have to rename files for dating
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [defaultSalesCategory, setDefaultSalesCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    setFile(e.target.files && e.target.files[0]);
  };

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
    if (defaultSalesCategory) form.append('default_sales_category', defaultSalesCategory);
    if (notes) form.append('notes', notes);

    setIsSubmitting(true);
    try {
      const resp = await api.post('/api/sales/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(resp.data);
    } catch (err) {
      console.error('Upload failed', err);
      if (err?.response?.data) setError(err.response.data.error || JSON.stringify(err.response.data));
      else setError(err.message || 'Upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Upload Daily Sales (Toast PMIX)</h1>
        <p className="text-gray-600">Upload a Toast PMIX CSV export. Header/layout rows will be ignored.</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>
      )}

      {result && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <div>Upload successful</div>
          <div>Upload ID: {result.upload_id}</div>
          <div>Rows parsed: {result.rows}</div>
          <div className="mt-2">
            <button onClick={() => navigate(`/sales/uploads`)} className="text-sm text-blue-600 underline">View uploads</button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white shadow rounded p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="w-full"
              aria-label="Sales CSV file"
              autoComplete="off"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Business Date (optional)</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="shadow border rounded w-full py-2 px-3"
              aria-label="Business date"
              autoComplete="on"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Required. This is used to group sales for the day; filename date is no longer needed.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Default Sales Category (optional)</label>
            <input
              type="text"
              value={defaultSalesCategory}
              onChange={(e) => setDefaultSalesCategory(e.target.value)}
              className="shadow border rounded w-full py-2 px-3"
              aria-label="Default Sales Category"
              autoComplete="off"
              placeholder="e.g., Food, Beverage, Retail"
            />
            <p className="text-xs text-gray-500 mt-1">If the CSV is missing a sales category, this value will be used.</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="shadow border rounded w-full py-2 px-3"
            rows={3}
            aria-label="Notes"
            autoComplete="off"
          />
        </div>

        <div className="flex justify-end gap-4">
          <button type="button" onClick={() => navigate('/')} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">Cancel</button>
          <button type="submit" disabled={isSubmitting} className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {isSubmitting ? 'Uploading...' : 'Upload CSV'}
          </button>
        </div>
      </form>

    </div>
  );
}

export default SalesUpload;
