import React, { useState, useRef, useEffect } from 'react';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function InventoryScanner() {
  const [barcode, setBarcode] = useState('');
  const [feedback, setFeedback] = useState('Ready');
  const [item, setItem] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [prepItems, setPrepItems] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const barcodeInputRef = useRef(null);

  // Add data fetching effect
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [itemsRes, ingredientsRes] = await Promise.all([
          fetch(`${API_URL}/items?is_prep=true`),
          fetch(`${API_URL}/ingredients`)
        ]);

        if (!itemsRes.ok || !ingredientsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const [itemsData, ingredientsData] = await Promise.all([
          itemsRes.json(),
          ingredientsRes.json()
        ]);

        setPrepItems(itemsData);
        setIngredients(ingredientsData);
        setFeedback('Ready');
      } catch (error) {
        console.error('Fetch error:', error);
        setError('Failed to load items');
        setFeedback('Error loading items');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []); // Run once on mount

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

      const data = await res.json();
      console.log('Barcode map response:', data);

      if (!data.found) {
        if (prepItems.length === 0 || ingredients.length === 0) {
          const [itemsRes, ingredientsRes] = await Promise.all([
            fetch(`${API_URL}/items?is_prep=true`),
            fetch(`${API_URL}/ingredients`)
          ]);

          const [itemsData, ingredientsData] = await Promise.all([
            itemsRes.json(),
            ingredientsRes.json()
          ]);

          setPrepItems(itemsData);
          setIngredients(ingredientsData);
        }
        setShowDropdown(true);
        setFeedback('New code - Select item (1+Enter for first)');
        setItem(null);
      } else {
        // Handle existing barcode mapping
        const sourceType = data.data.source_type;
        const sourceId = data.data.source_id;
        
        // Find the matching item based on source type
        const matchedItem = sourceType === 'item' 
          ? prepItems.find(p => p.id === sourceId)
          : ingredients.find(i => i.id === sourceId);

        if (matchedItem) {
          setItem(matchedItem);
          setShowDropdown(false);
          setFeedback(`Found: ${matchedItem.name}`);
        } else {
          throw new Error('Mapped item not found in loaded data');
        }
      }
    } catch (error) {
      console.error('Scan error:', error); // Add error logging
      setFeedback('Error - Try again');
    }
    setBarcode('');
  };

const createBarcodeMapping = async (selectedItem) => {
    console.log('Creating barcode mapping - selected item:', selectedItem);
    console.log('Barcode being mapped:', barcode);
    
    // Determine if it's a prep item or ingredient and get the correct ID
    const sourceId = selectedItem.is_prep ? selectedItem.id : selectedItem.ingredient_id;
    
    const payload = {
      barcode: barcode,
      source_type: selectedItem.is_prep ? 'item' : 'ingredient',
      source_id: sourceId
    };
    
    console.log('Barcode mapping payload:', payload);

    try {
      const mappingRes = await fetch(`${API_URL}/barcode-map`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!mappingRes.ok) {
        const errorData = await mappingRes.json();
        console.error('Mapping response error:', errorData);
        throw new Error(`Failed to create barcode mapping: ${errorData.error || mappingRes.statusText}`);
      }

      const mappingData = await mappingRes.json();
      console.log('Mapping response:', mappingData);
      
      if (mappingData.status !== 'Mapping updated') {
        throw new Error('Failed to update barcode mapping');
      }

      return mappingData;
    } catch (error) {
      console.error('Mapping error:', error);
      throw error;
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (item && quantity) {
        handleSave();
      } else if (item) {
        setQuantity('1');
        handleSave();
      } else {
        handleScanSubmit(e);
      }
    }
  };

const renderDropdown = () => {
    console.log('Raw prepItems:', prepItems);
    console.log('Raw ingredients:', ingredients);

    // Filter prep items - look for is_prep and id
    const filteredPrepItems = prepItems.filter(item => 
      item && 
      item.is_prep === true &&  
      item.name
    );
    
    // Filter ingredients - look for ingredient_id
    const validIngredients = ingredients.filter(item => 
      item && 
      item.ingredient_id && 
      item.name
    );

    console.log('Filtered prep items:', filteredPrepItems);
    console.log('Valid ingredients:', validIngredients);

    return (
      <div className="flex-1">
        <div className="text-yellow-400 text-lg mb-1">
          Select an item from the dropdown
        </div>
        <select
          value={item?.id || item?.ingredient_id || ''}
          onChange={async (e) => {
            const rawValue = e.target.value;
            console.log('Raw selected value:', rawValue);
            
            if (!rawValue) {
              console.log('Empty selection, returning');
              return;
            }

            const selectedId = parseInt(rawValue, 10);
            console.log('Parsed selectedId:', selectedId);

            // Look for the selected item in both arrays, accounting for different ID fields
            const selected = 
              filteredPrepItems.find(i => i.id === selectedId) ||
              validIngredients.find(i => i.ingredient_id === selectedId);
            
            console.log('Found selected item:', selected);
            
            if (selected) {
              try {
                console.log('About to create barcode mapping');
                await createBarcodeMapping(selected);
                console.log('Barcode mapping created successfully');
                
                setItem(selected);
                setShowDropdown(false);
                setFeedback(`Selected: ${selected.name} - Enter quantity`);
              } catch (error) {
                console.error('Selection error:', error);
                setFeedback('Failed to create barcode mapping');
              }
            }
          }}
          className="bg-gray-900 text-white text-xl p-3 w-full"
        >
          <option value="">Choose Item...</option>
          <optgroup label="Prep Items">
            {filteredPrepItems.map((option) => (
              <option 
                key={option.id} 
                value={String(option.id)}
              >
                {option.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Ingredients">
            {validIngredients.map((option) => (
              <option 
                key={option.ingredient_id} 
                value={String(option.ingredient_id)}
              >
                {option.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
    );
  };

  const handleSave = async () => {
    try {
      if (!item) return;

      const quantityToSave = quantity || '1';
      const scanData = [{
        barcode,
        quantity: quantityToSave,
        source_type: item.prep_notes ? 'ingredient' : 'item',
        source_id: item.id
      }];

      const saveRes = await fetch(`${API_URL}/inventory/upload-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scanData)
      });

      if (!saveRes.ok) {
        throw new Error('Failed to save inventory count');
      }

      setFeedback('Saved');
      resetForm();
    } catch (error) {
      console.error('Save error:', error);
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

   if (isLoading) {
    return (
      <div className="h-screen bg-black text-white p-2 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-black text-white p-2 flex items-center justify-center">
        <div className="text-red-500 text-xl">{error}</div>
      </div>
    );
  }

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
            {renderDropdown()}
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