import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CostCell from './components/CostCell';
import Select from 'react-select';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function NewItemForm() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [isPrep, setIsPrep] = useState(false);
  const [isForSale, setIsForSale] = useState(true);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [processNotes, setProcessNotes] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [prepItems, setPrepItems] = useState([]);
  const [recipe, setRecipe] = useState([]);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [fixingIndex, setFixingIndex] = useState(null);
  const [fixData, setFixData] = useState(null);
  const [yieldQty, setYieldQty] = useState('');
  const [yieldUnit, setYieldUnit] = useState('');
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/ingredients`)
      .then(res => res.json())
      .then(data => {
        console.log('Ingredients:', data); // Inspect to ensure names are present
        const active = data.filter(i => !i.archived); // Ensure only active ingredients are used
        const sorted = active.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setIngredients(sorted); // Keep the directory-based method for consistent data structuring
      });

    fetch(`${API_URL}/items`)
      .then(res => res.json())
      .then(data => {
        const preps = data.filter(i => i.is_prep && !i.is_archived);
        const sorted = preps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setPrepItems(sorted);
      });
  }, []);

  const handleAddIngredientToRecipe = () => {
    if (!newIngredientName) return;

    const existing = ingredients.find(i => i.name.toLowerCase() === newIngredientName.toLowerCase());
    if (existing) {
      alert('Ingredient already exists. Use the dropdown.');
      return;
    }

    fetch(`${API_URL}/ingredients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newIngredientName })
    })
      .then(res => res.json())
      .then(() => {
        setNewIngredientName('');
        return fetch(`${API_URL}/ingredients`);
      })
      .then(res => res.json())
      .then(data => {
        const active = data.filter(i => !i.archived);
        const sorted = active.sort((a, b) => a.name.localeCompare(b.name));
        setIngredients(sorted);
      });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const res = await fetch(`${API_URL}/items/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        is_prep: isPrep,
        is_for_sale: isForSale,
        price: price === '' ? null : parseFloat(price),
        description,
        process_notes: processNotes,
        yield_qty: isPrep ? yieldQty : null,
        yield_unit: isPrep ? yieldUnit : null
      })
    });

    const result = await res.json();
    if (!res.ok) {
      alert(result.error || 'Failed to create item');
      return;
    }

    const itemId = result.item_id;
    const seen = new Set();
    const cleaned = recipe.filter(r => {
      if (!r.source_type || !r.source_id || r.quantity === '' || r.unit.trim() === '') return false;
      const key = `${r.source_type}:${r.source_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (let r of cleaned) {
      const response = await fetch(`${API_URL}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          source_type: r.source_type,
          source_id: r.source_id,
          quantity: r.quantity,
          unit: r.unit,
          instructions: r.instructions || ''
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to save recipe line:', error);
        alert(`Failed to save recipe line for ${r.source_type}:${r.source_id}`);
      }
    }

    navigate(`/item/${itemId}`);
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Create New Item</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full border p-2 rounded" required />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="w-full border p-2 rounded" />
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" className="w-full border p-2 rounded" type="number" step="0.01" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full border p-2 rounded" />
        <textarea value={processNotes} onChange={(e) => setProcessNotes(e.target.value)} placeholder="Process Notes" className="w-full border p-2 rounded" />

        <div className="flex gap-4">
          <label><input type="checkbox" checked={isPrep} onChange={() => setIsPrep(!isPrep)} /> Is Prep</label>
          <label><input type="checkbox" checked={isForSale} onChange={() => setIsForSale(!isForSale)} /> For Sale</label>
        </div>

        {isPrep && (
          <div className="flex gap-2">
            <input value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} placeholder="Yield Qty" className="border p-2 rounded w-32" />
            <input value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} placeholder="Yield Unit" className="border p-2 rounded w-48" />
          </div>
        )}

        <div className="mt-6">
          <h2 className="font-semibold mb-2">Recipe Ingredients</h2>
          <input
            type="text"
            placeholder="Filter ingredients/prep items..."
            className="border p-1 mb-2 rounded w-full"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />

          {recipe.map((r, index) => (
            <div key={index} className="mb-2 flex gap-2 items-center">
              <Select
                value={{
                  value: `${r.source_type}:${r.source_id}`,
                  label:
                    r.source_type === 'ingredient'
                      ? `🧂 ${ingredients.find(i => i.ingredient_id === r.source_id)?.name || 'Unnamed Ingredient'}`
                      : `🛠️ ${prepItems.find(i => i.item_id === r.source_id)?.name || 'Unnamed Prep Item'}`
                }}
                onChange={(selectedOption) => {
                  if (selectedOption) {
                    const [type, id] = selectedOption.value.split(':');
                    const updated = [...recipe];
                    updated[index].source_type = type;
                    updated[index].source_id = parseInt(id);
                    setRecipe(updated);
                  }
                }}
                options={[
                  {
                    label: "🧂 Ingredients",
                    options: ingredients
                      .filter((i) => i.name.toLowerCase().includes(filterText.toLowerCase()))
                      .map((i) => ({
                        value: `ingredient:${i.ingredient_id}`,
                        label: `🧂 ${i.name || 'Unnamed Ingredient'}`
                      }))
                  },
                  {
                    label: "🛠️ Prep Items",
                    options: prepItems
                      .filter((i) => i.name.toLowerCase().includes(filterText.toLowerCase()))
                      .map((i) => ({
                        value: `item:${i.item_id}`,
                        label: `🛠️ ${i.name || 'Unnamed Prep Item'}`
                      }))
                  }
                ]}
                className="w-full border p-1 rounded"
              />
              <input
                type="number"
                placeholder="Qty"
                className="w-16 border p-1 rounded"
                value={r.quantity}
                onChange={(e) => {
                  const updated = [...recipe];
                  updated[index].quantity = e.target.value;
                  setRecipe(updated);
                }}
              />
              <input
                placeholder="Unit"
                className="w-20 border p-1 rounded"
                value={r.unit}
                onChange={(e) => {
                  const updated = [...recipe];
                  updated[index].unit = e.target.value;
                  setRecipe(updated);
                }}
              />
              <CostCell
                sourceType={r.source_type}
                sourceId={r.source_id}
                unit={r.unit}
                qty={r.quantity}
                onMissing={(data) => {
                  setFixingIndex(index);
                  setFixData(data);
                }}
              />
              <button
                type="button"
                onClick={() => setRecipe(recipe.filter((_, i) => i !== index))}
                className="text-red-600"
              >✕</button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setRecipe([...recipe, {
              source_type: '',
              source_id: '',
              quantity: '',
              unit: '',
              instructions: ''
            }])}
            className="bg-blue-500 text-white px-3 py-1 rounded"
          >+ Add Ingredient</button>

          <div className="mt-4 flex gap-2">
            <input
              placeholder="New Ingredient Name"
              value={newIngredientName}
              onChange={(e) => setNewIngredientName(e.target.value)}
              className="border p-1 rounded"
            />
            <button
              type="button"
              onClick={handleAddIngredientToRecipe}
              className="bg-green-500 text-white px-3 py-1 rounded"
            >+ Create Ingredient</button>
          </div>
        </div>

        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Create Item</button>
      </form>
    </div>
  );
}

export default NewItemForm;
