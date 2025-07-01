import React, { useEffect, useState, useRef } from 'react';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';
const SCANNER_WS_URL = 'ws://localhost:8080'; // We'll configure this later
function InventoryScanner() {
  const [barcode, setBarcode] = useState('');
  const [item, setItem] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [prepItems, setPrepItems] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [items, setItems] = useState([]);
  const [showUnmapped, setShowUnmapped] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(SCANNER_WS_URL);

    ws.onopen = () => {
      setWsConnected(true);
      setFeedback('Scanner connected');
    };

    ws.onclose = () => {
      setWsConnected(false);
      setFeedback('Scanner disconnected - using manual mode');
    };

    ws.onmessage = (event) => {
      const scannedBarcode = event.data;
      setBarcode(scannedBarcode);
      handleScanSubmit(null, scannedBarcode);
    };

    const loadItems = async () => {
      const itemsRes = await fetch(`${API_URL}/items?is_prep=true`);
      const ingredientsRes = await fetch(`${API_URL}/ingredients`);
      const itemsData = await itemsRes.json();
      const ingredientsData = await ingredientsRes.json();
      setPrepItems(itemsData);
      setIngredients(ingredientsData);
    };

    loadItems();
    return () => {
      ws.close();
    };
  }, []);

    // Autofocus barcode input on page load
    barcodeInputRef.current.focus();
  }, []);

 const handleScanSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/barcode-map?barcode=${barcode}`);
  const handleScanSubmit = async (e, scannedBarcode = null) => {
    if (e) e.preventDefault();
    const barcodeToCheck = scannedBarcode || barcode;

    try {
      const res = await fetch(`${API_URL}/barcode-map?barcode=${barcodeToCheck}`);
      if (!res.ok) throw new Error('Failed to fetch barcode mapping');

    if (res.status === 204) {
      setShowDropdown(true); // If not found, show dropdown
      setFeedback('Unmapped Barcode. Please select an ingredient or prep item.');
      setItem(null); // Reset item state since it's not found
    } else if (res.ok) {
      const data = await res.json();
      setItem(data.item);
      setShowDropdown(false); // Reset dropdown visibility if item is found
      setFeedback('Barcode successfully mapped. Please enter the quantity.');
    }
  };

  const handleSave = async () => {
    if (item) {
      // Handle saving the scan with mapped item
      await fetch(`${API_URL}/inventory/upload-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode, quantity }),
      });
      setFeedback('Scan saved successfully.');
    } else {
      // Handle mapping the barcode
      const selected = ingredients.concat(prepItems).find(i => i.id === parseInt(item));
      await fetch(`${API_URL}/barcode-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode, source_type: selected.type, source_id: selected.id }),
      });
      setFeedback('Barcode mapped successfully. Please enter the inventory quantity now.');
    }

    // Reset form after processing
    resetForm();
  };

  const resetForm = () => {
    setBarcode('');
    setItem(null);
    setQuantity('');
    setFeedback('');
    setShowDropdown(false);
    barcodeInputRef.current.focus(); // Focus the barcode input again
  };



  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="mb-4">
        {wsConnected ? (
          <span className="text-green-500">Scanner Connected</span>
        ) : (
          <span className="text-gray-500">Manual Mode</span>
        )}
    </div>
      <form onSubmit={handleScanSubmit} className="space-y-4">
        <input
          ref={barcodeInputRef} // Attach the ref to the input
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Scan barcode or enter manually..."
          className="border p-2"
          autoFocus // Ensure the input is focused on mount
        />
        {item && !showDropdown && (
          <div>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter inventory quantity"
              className="border p-2"
            />
            <button type="button" onClick={handleSave} className="bg-green-500 text-white p-2">
              Save
            </button>
          </div>
        )}
        {showDropdown && (
          <div>
            <select onChange={(e) => setItem(e.target.value)} className="border p-2">
              <option value="">Select an item</option>
              {[...prepItems, ...ingredients].map((option) => (
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
      {feedback && <div className="mt-4 text-green-500">{feedback}</div>}
    </div>
  );
}

export default InventoryScanner;

