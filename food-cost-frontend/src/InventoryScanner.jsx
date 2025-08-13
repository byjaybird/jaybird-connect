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
        const token = localStorage.getItem('token');
        const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {};

        const [itemsRes, ingredientsRes] = await Promise.all([
          fetch(`${API_URL}/items?is_prep=true`, { headers: authHeader }),
          fetch(`${API_URL}/ingredients`, { headers: authHeader })
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
      const token = localStorage.getItem('token');
      const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {};

      // Load the items first to ensure we have data
      const [itemsRes, ingredientsRes] = await Promise.all([
        fetch(`${API_URL}/items?is_prep=true`, { headers: authHeader }),
        fetch(`${API_URL}/ingredients`, { headers: authHeader })
      ]);

      const [itemsData, ingredientsData] = await Promise.all([
        itemsRes.json(),
        ingredientsRes.json()
      ]);

      console.log('Loaded items:', itemsData);
      console.log('Loaded ingredients:', ingredientsData);

      setPrepItems(itemsData);
      setIngredients(ingredientsData);

      // Now check the barcode mapping
      const res = await fetch(`${API_URL}/barcode-map?barcode=${barcode}`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        }
      });
      if (!res.ok) throw new Error('Failed to fetch');

      const data = await res.json();
      console.log('Barcode map response:', data);

      if (!data.found) {
        setShowDropdown(true);
        setFeedback('Select an item from the dropdown');
      } else {
        // Handle existing barcode mapping
        const sourceType = data.data.source_type;
        const sourceId = data.data.source_id;
        
        console.log('Looking for mapped item with:', { sourceType, sourceId });
        
        let matchedItem;
        if (sourceType === 'item') {
          // For items, match on item_id
          matchedItem = itemsData.find(p => Number(p.item_id) === Number(sourceId));
        } else {
          // For ingredients, match on ingredient_id
          matchedItem = ingredientsData.find(i => Number(i.ingredient_id) === Number(sourceId));
        }

        console.log('Matched item:', matchedItem);

        if (matchedItem) {
          // Normalize the item structure
          const normalizedItem = {
            ...matchedItem,
            // Ensure consistent ID field
            id: sourceType === 'item' ? matchedItem.item_id : matchedItem.ingredient_id,
            // Add source type for later use
            is_prep: sourceType === 'item'
          };
          
          setItem(normalizedItem);
          setShowDropdown(false);
          setFeedback(`Found: ${matchedItem.name}`);
        } else {
          throw new Error(`Mapped item not found in loaded data (${sourceType} ID: ${sourceId})`);
        }
      }
    } catch (error) {
      console.error('Scan error:', error);
      setFeedback('Error - Try again');
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
    // Filter prep items - just check for is_prep true and name
    const filteredPrepItems = prepItems.filter(item => 
      item && 
      item.is_prep === true && 
      item.name
    );
    
    // Keep the working ingredients filter
    const validIngredients = ingredients.filter(item => 
      item && 
      item.ingredient_id && 
      item.name
    );

    return (
      <div className="flex-1">
        <div className="text-yellow-400 text-lg mb-1">
          Select an item from the dropdown
        </div>
        <select
          value={item?.id || ''}
          onChange={async (e) => {
            const rawValue = e.target.value;
            console.log('Raw selected value:', rawValue);
            console.log('Current barcode:', barcode);
            
            if (!rawValue) return;

            const selectedId = parseInt(rawValue, 10);
            console.log('Parsed selectedId:', selectedId);

            // Find selected item using correct ID field
            const selected = 
              filteredPrepItems.find(i => i.item_id === selectedId) ||
              validIngredients.find(i => i.ingredient_id === selectedId);
            
            console.log('Found selected item:', selected);
            
            if (selected) {
              try {
                const mappingPayload = {
                  barcode: barcode,
                  source_type: selected.is_prep ? 'item' : 'ingredient',
                  source_id: selected.is_prep ? selected.item_id : selected.ingredient_id
                };
                console.log('Mapping payload:', mappingPayload);

                const mappingRes = await fetch(`${API_URL}/barcode-map`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...authHeader
                  },
                  body: JSON.stringify(mappingPayload)
                });

                if (!mappingRes.ok) {
                  const errorData = await mappingRes.json();
                  console.error('Mapping response error:', errorData);
                  throw new Error(`Failed to create barcode mapping: ${errorData.error || mappingRes.statusText}`);
                }

                const mappingData = await mappingRes.json();
                console.log('Mapping response:', mappingData);
                
                // Normalize the item structure when setting
                const normalizedItem = {
                  ...selected,
                  id: selected.is_prep ? selected.item_id : selected.ingredient_id,
                  is_prep: !!selected.is_prep
                };
                
                setItem(normalizedItem);
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
          {filteredPrepItems.length > 0 && (
            <optgroup label="Prep Items">
              {filteredPrepItems.map((option) => (
                <option 
                  key={option.item_id} 
                  value={option.item_id}
                >
                  {option.name}
                </option>
              ))}
            </optgroup>
          )}
          {validIngredients.length > 0 && (
            <optgroup label="Ingredients">
              {validIngredients.map((option) => (
                <option 
                  key={option.ingredient_id} 
                  value={option.ingredient_id}
                >
                  {option.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    );
  };

const handleSave = async () => {
    try {
      if (!item) return;

      const quantityToSave = quantity || '1';
      console.log('Saving inventory with item:', item);
      console.log('Quantity to save:', quantityToSave);

      const scanData = [{
        barcode: barcode,
        quantity: quantityToSave,
        source_type: item.is_prep ? 'item' : 'ingredient',
        source_id: item.is_prep ? item.id : item.ingredient_id
      }];

      console.log('Inventory save payload:', scanData);

      const saveRes = await fetch(`${API_URL}/inventory/upload-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader // Add auth token
        },
        body: JSON.stringify(scanData)
      });

      if (!saveRes.ok) {
        const errorData = await saveRes.json();
        console.error('Save response error:', errorData);
        throw new Error(`Failed to save inventory count: ${errorData.error || saveRes.statusText}`);
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