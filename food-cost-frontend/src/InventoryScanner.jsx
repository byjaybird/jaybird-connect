import React, { useState, useRef, useEffect } from 'react';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';
function InventoryScanner() {
  const [barcode, setBarcode] = useState('');
  const [feedback, setFeedback] = useState('Ready');
  const [item, setItem] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantity, setQuantity] = useState('');
  const barcodeInputRef = useRef(null);

  useEffect(() => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [showDropdown, item]);

  const handleScanSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!barcode) return;

    try {
      const res = await fetch(`${API_URL}/barcode-map?barcode=${barcode}`);
      if (!res.ok) throw new Error('Failed to fetch');

      if (res.status === 204) {
        setShowDropdown(true);
        setFeedback('New code - Select item (1+Enter for first)');
        setItem(null);
      } else {
        const data = await res.json();
        setItem(data.item);
        setShowDropdown(false);
        setFeedback(`Found: ${data.item.name}`);
      }
    } catch (error) {
      setFeedback('Error - Try again');
    }
    setBarcode('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (showDropdown) {
        if (barcode === '1' && prepItems?.length > 0) {
          setItem(prepItems[0]);
          handleSave();
        }
      } else if (item) {
        if (!quantity) setQuantity('1');
        handleSave();
      } else {
        handleScanSubmit(e);
      }
    }
  };

  const handleSave = async () => {
    try {
      setFeedback('Saved');
      resetForm();
    } catch (error) {
      setFeedback('Save failed - Try again');
    }
  };

  const resetForm = () => {
    setBarcode('');
    setItem(null);
    setShowDropdown(false);
    setQuantity('');
    setFeedback('Ready');
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  return (
    <div className="h-screen bg-black text-white p-2 flex flex-col">
      <div className="bg-gray-900 p-1 text-center text-lg">
        {feedback}
      </div>
      <div className="flex-1 flex flex-col gap-2 mt-2">
        <input
              ref={barcodeInputRef}
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
          onKeyPress={handleKeyPress}
          className="bg-gray-900 text-white text-2xl p-3 w-full"
              autoFocus
          autoComplete="off"
          placeholder="Scan or type code..."
            />
        {showDropdown && (
          <div className="flex-1">
            <div className="text-yellow-400 text-lg mb-1">
              Press 1 + Enter for first item
            </div>
            <select
              value={item?.id || ''}
              onChange={(e) => {
                const selected = [...prepItems, ...ingredients].find(i => i.id === e.target.value);
                setItem(selected);
                handleSave();
              }}
              className="bg-gray-900 text-white text-xl p-3 w-full"
            >
              <option value="">Choose Item...</option>
              {[...prepItems, ...ingredients].map((option, idx) => (
                <option key={option.id} value={option.id}>
                  {idx + 1}. {option.name}
                </option>
              ))}
            </select>
            </div>
        )}
        {item && !showDropdown && (
          <div className="flex-1">
            <div className="bg-gray-900 p-3 mb-1">
              <div className="text-2xl">{item.name}</div>
              <div className="text-gray-400">Current: {item.quantity || 'N/A'}</div>
      </div>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyPress={handleKeyPress}
              className="bg-gray-900 text-white text-2xl p-3 w-full"
              placeholder="Enter quantity (Enter for 1)"
              pattern="[0-9]*"
              inputMode="numeric"
              autoFocus
            />
    </div>
        )}
      </div>
    </div>
  );
}

export default InventoryScanner;
