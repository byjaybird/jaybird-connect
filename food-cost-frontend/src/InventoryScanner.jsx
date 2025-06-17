import React, { useEffect, useState } from 'react';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function InventoryScanner() {
  const [barcode, setBarcode] = useState('');
  const [item, setItem] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [feedback, setFeedback] = useState('');
  const [items, setItems] = useState([]);
  const [showUnmapped, setShowUnmapped] = useState(false);

  useEffect(() => {
    const loadItems = async () => {
      try {
        const itemsRes = await fetch(`${API_URL}/items?is_prep=true`);
        const ingredientsRes = await fetch(`${API_URL}/ingredients`);

        if (!itemsRes.ok || !ingredientsRes.ok) throw new Error('Failed to load items/ingredients');

        const itemsData = await itemsRes.json();
        const ingredientsData = await ingredientsRes.json();

        setItems([...itemsData, ...ingredientsData]);
      } catch (err) {
        console.error('Error loading items/ingredients', err);
      }
    };

    loadItems();
  }, []);

  useEffect(() => {
    // Autofocus input on page load
    document.querySelector('#barcode-input').focus();
  }, []);

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/barcode-map/lookup?barcode=${barcode}`);
      if (!res.ok) throw new Error('Failed to fetch barcode mapping');

      const data = await res.json();
      if (data.mapped) {
        setItem(data.item);
        setShowUnmapped(false);
      } else {
        setShowUnmapped(true);
        setFeedback('Unmapped Barcode');
      }
    } catch (err) {
      console.error('Error fetching barcode mapping', err);
    }
  };

  const handleSave = async () => {
    if (item) {
      try {
        await fetch(`${API_URL}/inventory/upload-scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode, quantity }),
        });
        setFeedback('Scan saved successfully');
        resetForm();
      } catch (err) {
        console.error('Error saving scan', err);
      }
    } else {
      try {
        const selected = items.find(i => i.id === parseInt(item));
        await fetch(`${API_URL}/barcode-map`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode, source_type: selected.type, source_id: selected.id }),
        });
        setFeedback('Barcode mapped successfully');
        resetForm();
      } catch (err) {
        console.error('Error mapping barcode', err);
      }
    }
  };

  const resetForm = () => {
    setBarcode('');
    setItem(null);
    setQuantity('');
    setFeedback('');
    setShowUnmapped(false);
    document.querySelector('#barcode-input').focus();
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <form onSubmit={handleScanSubmit} className="space-y-4">
        <input
          id="barcode-input"
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Scan barcode..."
          className="border p-2"
        />
        {item && !showUnmapped && (
          <div className="space-y-4">
            <div>{`Item: ${item.name} ${item.type}`}</div>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              className="border p-2"
            />
            <button type="button" onClick={handleSave} className="bg-green-500 text-white p-2">
              Save
            </button>
          </div>
        )}
        {showUnmapped && (
          <div className="space-y-4">
            <select onChange={(e) => setItem(e.target.value)} className="border p-2">
              <option value="">Select an item</option>
              {items.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.type})
                </option>
              ))}
            </select>
            <button type="button" onClick={handleSave} className="bg-blue-500 text-white p-2">
              Map and Save
            </button>
          </div>
        )}
      </form>
      {feedback && <div className={`mt-4 p-2 ${showUnmapped ? 'text-red-500' : 'text-green-500'}`}>{feedback}</div>}
    </div>
  );
}

export default InventoryScanner;