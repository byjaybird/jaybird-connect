import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import { api } from './utils/auth';

export default function ManualInventoryAdd({ onSaved }) {
  const [rows, setRows] = useState([{ id: Date.now(), source_type: '', source_id: '', name: '', quantity: '', unit: '' }]);
  const [items, setItems] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const [itemsRes, ingredientsRes] = await Promise.all([
          api.get('/api/items?is_prep=true'),
          api.get('/api/ingredients')
        ]);
        if (!mounted) return;
        setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
        setIngredients(Array.isArray(ingredientsRes.data) ? ingredientsRes.data : []);
      } catch (err) {
        console.error('Failed to load items/ingredients', err.response || err);
      }
    };
    fetchData();
    return () => { mounted = false; };
  }, []);

  const addRow = () => {
    setRows(r => ([...r, { id: Date.now() + Math.random(), source_type: '', source_id: '', name: '', quantity: '', unit: '' }]));
  };

  const removeRow = (id) => {
    setRows(r => r.filter(row => row.id !== id));
  };

  const handleSelect = (id, selected) => {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      if (!selected) return { ...row, source_type: '', source_id: '', name: '' };
      // selected carries a value that we'll encode as `${type}::${id}`
      const [type, sid] = String(selected.value).split('::');
      return { ...row, source_type: type, source_id: Number(sid), name: selected.label };
    }));
  };

  const handleChange = (id, field, value) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleSubmit = async (e) => {
    e && e.preventDefault();
    setMessage(null);
    // Validate
    const payload = [];
    for (let row of rows) {
      if (!row.source_type || !row.source_id) continue; // skip incomplete
      const qty = row.quantity || '0';
      payload.push({
        barcode: '',
        quantity: qty,
        source_type: row.source_type,
        source_id: row.source_id,
        unit: row.unit || 'unit_from_manual'
      });
    }
    if (payload.length === 0) {
      setMessage({ type: 'error', text: 'No valid rows to submit' });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/api/inventory/upload-scan', payload);
      setMessage({ type: 'success', text: `Saved ${payload.length} entries` });
      // reset rows to one empty
      setRows([{ id: Date.now(), source_type: '', source_id: '', name: '', quantity: '', unit: '' }]);
      // notify parent (modal) that save completed
      if (onSaved && typeof onSaved === 'function') {
        try { onSaved(payload.length); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Save failed', err.response || err);
      setMessage({ type: 'error', text: 'Failed to save inventory entries' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const options = [];
  if (items && items.length) {
    options.push({ label: 'Prep Items', options: items.map(it => ({ value: `item::${it.item_id}`, label: it.name })) });
  }
  if (ingredients && ingredients.length) {
    options.push({ label: 'Ingredients', options: ingredients.map(i => ({ value: `ingredient::${i.ingredient_id}`, label: i.name })) });
  }

  return (
    <div className="mb-6 bg-white shadow rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Add Inventory (Manual)</h3>
        <div className="flex items-center space-x-2">
          <button type="button" onClick={addRow} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded">Add Row</button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className={`bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded ${isSubmitting ? 'opacity-50' : ''}`}>{isSubmitting ? 'Saving...' : 'Save All'}</button>
        </div>
      </div>

      {message && (
        <div className={`mb-3 p-2 rounded ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-gray-50 p-3 rounded">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-700">Item</label>
                <Select
                  value={row.source_type && row.source_id ? { value: `${row.source_type}::${row.source_id}`, label: row.name } : null}
                  onChange={(sel) => handleSelect(row.id, sel)}
                  options={options}
                  className="react-select-container"
                  classNamePrefix="react-select"
                  placeholder="Select item..."
                  isClearable
                  aria-label={`Select item ${idx + 1}`}
                />
              </div>
              <div>
                <label className="text-sm text-gray-700">Quantity</label>
                <input
                  type="number"
                  step="any"
                  value={row.quantity}
                  onChange={(e) => handleChange(row.id, 'quantity', e.target.value)}
                  className="shadow border rounded w-full py-2 px-3"
                  placeholder="Quantity"
                  autoComplete="off"
                  aria-label={`Quantity ${idx + 1}`}
                />
              </div>
              <div>
                <label className="text-sm text-gray-700">Unit</label>
                <input
                  type="text"
                  value={row.unit}
                  onChange={(e) => handleChange(row.id, 'unit', e.target.value)}
                  className="shadow border rounded w-full py-2 px-3"
                  placeholder="e.g., L, kg, cases"
                  autoComplete="off"
                  aria-label={`Unit ${idx + 1}`}
                />
              </div>
              <div className="col-span-1 md:col-span-1">
                <div className="flex space-x-2">
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(row.id)} className="text-red-500">Remove</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </form>

      <div className="mt-3 text-sm text-gray-600">Tip: You can add many rows and then click Save All to submit in bulk.</div>
    </div>
  );
}
