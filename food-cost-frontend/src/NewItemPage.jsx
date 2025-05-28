import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const [recipe, setRecipe] = useState([]);
  const [newIngredientName, setNewIngredientName] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/ingredients`)
      .then(res => res.json())
      .then(data => {
        const active = data.filter(i => !i.archived);
        const sorted = active.sort((a, b) => a.name.localeCompare(b.name));
        setIngredients(sorted);
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
      body: JSON.stringify({ name, category, is_prep: isPrep, is_for_sale: isForSale, price, description, process_notes: processNotes })
    });
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || 'Failed to create item');
      return;
    }
    const itemId = result.item_id;

    // Post recipe entries
    for (let ing of recipe) {
      await fetch(`${API_URL}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          ingredient_id: ing.ingredient_id,
          quantity: ing.quantity,
          unit: ing.unit,
          instructions: ing.instructions || ''
        })
      });
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

        <div className="mt-6">
          <h2 className="font-semibold mb-2">Recipe Ingredients</h2>
          {recipe.map((r, index) => (
            <div key={index} className="mb-2 flex gap-2">
              <select value={r.ingredient_id} onChange={(e) => {
                const updated = [...recipe];
                updated[index].ingredient_id = parseInt(e.target.value);
                setRecipe(updated);
              }} className="border p-1 rounded">
                <option value="">-- Select Ingredient --</option>
                {ingredients.map((i) => (
                  <option key={i.ingredient_id} value={i.ingredient_id}>{i.name}</option>
                ))}
              </select>
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
              <button
                type="button"
                onClick={() => setRecipe(recipe.filter((_, i) => i !== index))}
                className="text-red-600"
              >✕</button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setRecipe([...recipe, { ingredient_id: '', quantity: '', unit: '' }])}
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
