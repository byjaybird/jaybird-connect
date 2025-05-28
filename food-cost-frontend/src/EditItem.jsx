import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function EditItem() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    is_prep: false,
    is_for_sale: false,
    price: '',
    description: '',
    notes: '',
    is_archived: false
  });
  const [ingredients, setIngredients] = useState([]);
  const [recipe, setRecipe] = useState([]);
  const [originalRecipeIds, setOriginalRecipeIds] = useState(new Set());
  const [newIngredientName, setNewIngredientName] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/items/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setItem(data);
        setFormData({
          name: data.name || '',
          category: data.category || '',
          is_prep: !!data.is_prep,
          is_for_sale: !!data.is_for_sale,
          price: data.price ?? '',
          description: data.description || '',
          notes: data.process_notes || '',
          is_archived: !!data.archived
        });
      });

    fetch(`${API_URL}/ingredients`)
      .then((res) => res.json())
      .then((data) => {
        const active = data.filter(i => !i.archived);
        const sorted = active.sort((a, b) => a.name.localeCompare(b.name));
        setIngredients(sorted);
      });

    fetch(`${API_URL}/recipes/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setRecipe(data);
        setOriginalRecipeIds(new Set(data.map(r => r.recipe_id)));
      });
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const cleanRecipe = recipe.filter(r =>
      r.ingredient_id && r.quantity !== '' && r.unit.trim() !== ''
    );

    const res = await fetch(`${API_URL}/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name,
        category: formData.category,
        is_prep: formData.is_prep,
        is_for_sale: formData.is_for_sale,
        price: formData.price === '' ? null : parseFloat(formData.price),
        description: formData.description,
        process_notes: formData.notes,
        is_archived: formData.is_archived
      })
    });

    const result = await res.json();
    if (!res.ok) {
      alert(result.error || 'Failed to update item');
      return;
    }

    const currentRecipeIds = new Set(cleanRecipe.filter(r => r.recipe_id).map(r => r.recipe_id));
    const deletedRecipeIds = Array.from(originalRecipeIds).filter(id => !currentRecipeIds.has(id));

    for (let delId of deletedRecipeIds) {
      await fetch(`${API_URL}/recipes/${delId}`, { method: 'DELETE' });
    }

    for (let r of cleanRecipe) {
      await fetch(`${API_URL}/recipes/${r.recipe_id || ''}`, {
        method: r.recipe_id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: parseInt(id),
          ingredient_id: parseInt(r.ingredient_id),
          quantity: r.quantity,
          unit: r.unit,
          instructions: r.instructions || ''
        })
      });
    }

    navigate(`/item/${id}`);
  };

  const handleAddNewIngredient = async () => {
    if (!newIngredientName.trim()) return;
    const res = await fetch(`${API_URL}/ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newIngredientName, category: '', notes: '', unit: '' })
    });
    const data = await res.json();
    if (res.ok) {
      const newList = [...ingredients, data].sort((a, b) => a.name.localeCompare(b.name));
      setIngredients(newList);
      setRecipe([...recipe, { ingredient_id: data.ingredient_id, quantity: '', unit: '', recipe_id: null }]);
      setNewIngredientName('');
    }
  };

  const usedIngredientIds = recipe.map(r => parseInt(r.ingredient_id));

  if (!item) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Edit Item</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input name="name" value={formData.name} onChange={handleChange} placeholder="Name" className="w-full border p-2 rounded" required />
        <input name="category" value={formData.category} onChange={handleChange} placeholder="Category" className="w-full border p-2 rounded" />
        <input name="price" value={formData.price} onChange={handleChange} placeholder="Price" type="number" step="0.01" className="w-full border p-2 rounded" />
        <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Description" className="w-full border p-2 rounded" />
        <textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Notes" className="w-full border p-2 rounded" />

        <div className="flex gap-4">
          <label><input type="checkbox" name="is_prep" checked={formData.is_prep} onChange={handleChange} /> Is Prep</label>
          <label><input type="checkbox" name="is_for_sale" checked={formData.is_for_sale} onChange={handleChange} /> For Sale</label>
          <label><input type="checkbox" name="is_archived" checked={formData.is_archived} onChange={handleChange} /> Archived</label>
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
                {ingredients.filter(i => !usedIngredientIds.includes(i.ingredient_id) || i.ingredient_id === r.ingredient_id).map((i) => (
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
            onClick={() => setRecipe([...recipe, { ingredient_id: '', quantity: '', unit: '', recipe_id: null }])}
            className="bg-blue-500 text-white px-3 py-1 rounded"
          >+ Add Ingredient</button>

          <div className="mt-4 flex gap-2 items-center">
            <input
              type="text"
              placeholder="New Ingredient Name"
              className="border p-1 rounded flex-1"
              value={newIngredientName}
              onChange={(e) => setNewIngredientName(e.target.value)}
            />
            <button
              type="button"
              className="bg-green-600 text-white px-3 py-1 rounded"
              onClick={handleAddNewIngredient}
            >+ Create & Add</button>
          </div>
        </div>

        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Save Changes</button>
      </form>
    </div>
  );
}

export default EditItem;
