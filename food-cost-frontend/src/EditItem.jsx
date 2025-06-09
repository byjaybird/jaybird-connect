import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CostCell from './components/CostCell';
import Select from 'react-select';

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
    is_archived: false,
    yield_qty: '',
    yield_unit: ''
  });
  const [ingredients, setIngredients] = useState([]);
  const [recipe, setRecipe] = useState([]);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [prepItems, setPrepItems] = useState([]);
  const [fixingIndex, setFixingIndex] = useState(null);
  const [fixData, setFixData] = useState(null);
  const [yieldQty, setYieldQty] = useState('');
  const [yieldUnit, setYieldUnit] = useState('');
  const [filterText, setFilterText] = useState('');

  const mapRecipeToOptions = (r) => {
    if (r.source_type === 'ingredient') {
      const ingredient = ingredients.find(i => i.ingredient_id === r.source_id);
      return ingredient ? { value: `ingredient:${ingredient.ingredient_id}`, label: `🧂 ${ingredient.name || 'Unnamed Ingredient'}` } : null;
    } else {
      const item = prepItems.find(i => i.item_id === r.source_id);
      return item ? { value: `item:${item.item_id}`, label: `🛠️ ${item.name || 'Unnamed Prep Item'}` } : null;
    }
  };

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
          is_archived: !!data.archived,
          yield_qty: data.yield_qty ?? '',
          yield_unit: data.yield_unit ?? ''
        });
      });

    fetch(`${API_URL}/ingredients`)
      .then((res) => res.json())
      .then((data) => {
        const active = data.filter(i => !i.archived);
        console.log('Ingredients:', active); // Add console logs if necessary
        const sorted = active.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setIngredients(sorted);
      });

    fetch(`${API_URL}/items`)
      .then(res => res.json())
      .then((data) => {
        const preps = data.filter(i => i.is_prep && !i.is_archived);
        const sorted = preps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setPrepItems(sorted);
      });

    fetch(`${API_URL}/recipes/${id}`)
      .then((res) => res.json())
      .then(setRecipe);
  }, [id]);


  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFixSave = async () => {
    if (!fixData || fixingIndex === null) return;
    const res = await fetch(`${API_URL}/ingredient_conversions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_id: recipe[fixingIndex].source_id,
        from_unit: fixData.from_unit,
        to_unit: fixData.to_unit,
        conversion_factor: fixData.suggested_factor
      })
    });
    if (res.ok) {
      setFixingIndex(null);
      setFixData(null);
    } else {
      alert("Failed to save conversion");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
        is_archived: formData.is_archived,
        yield_qty: formData.is_prep ? formData.yield_qty : null,
        yield_unit: formData.is_prep ? formData.yield_unit : null
      })
    });
    if (!res.ok) {
      const error = await res.json();
      alert(error.error || 'Failed to update item');
      return;
    }

    await fetch(`${API_URL}/recipes/${id}`, { method: 'DELETE' });
    const seen = new Set();
    const cleaned = recipe.filter(r => {
      if (!r.source_type || !r.source_id || r.quantity === '' || r.unit.trim() === '') return false;
      const key = `${r.source_type}:${r.source_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    await fetch(`${API_URL}/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: parseInt(id),
        recipe: cleaned
      })
    });

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
      setRecipe([...recipe, { ingredient_id: data.ingredient_id, quantity: '', unit: '' }]);
      setNewIngredientName('');
    }
  };

  const handleRemoveIngredient = (index) => {
    setRecipe(prev => prev.filter((_, i) => i !== index));
  };

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
          {formData.is_prep && (
            <>
              <input
                type="number"
                name="yield_qty"
                placeholder="Yield Quantity (e.g., 1)"
                value={formData.yield_qty}
                onChange={handleChange}
                className="w-full border p-2 rounded"
              />
              <input
                type="text"
                name="yield_unit"
                placeholder="Yield Unit (e.g., quart, each)"
                value={formData.yield_unit}
                onChange={handleChange}
                className="w-full border p-2 rounded"
              />
            </>
          )}
        </div>
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
                value={mapRecipeToOptions(r)}
                onChange={(selected) => {
                  const [type, id] = selected.value.split(':');
                  const updated = [...recipe];
                  updated[index] = { ...updated[index], source_type: type, source_id: parseInt(id) };
                  setRecipe(updated);
                }}
                options={[
                  {
                    label: '🧂 Ingredients',
                    options: ingredients
                      .filter((i) => i.name.toLowerCase().includes(filterText.toLowerCase()))
                      .map(i => ({ value: `ingredient:${i.ingredient_id}`, label: `🧂 ${i.name || 'Unnamed Ingredient'}` }))
                  },
                  {
                    label: '🛠️ Prep Items',
                    options: prepItems
                      .filter((i) => i.name.toLowerCase().includes(filterText.toLowerCase()))
                      .map(i => ({ value: `item:${i.item_id}`, label: `🛠️ ${i.name}` }))
                  }
                ]}
                className="basic-single w-full"
                classNamePrefix="select"
              />
              <input
                type="number"
                placeholder="Qty"
                className="w-16 border p-1 rounded"
                value={r.quantity}
                onChange={(e) => {
                  const updated = [...recipe];
                  updated[index] = { ...updated[index], quantity: e.target.value };
                  setRecipe(updated);
                }}
              />
              <input
                placeholder="Unit"
                className="w-20 border p-1 rounded"
                value={r.unit}
                onChange={(e) => {
                  const updated = [...recipe];
                  updated[index] = { ...updated[index], unit: e.target.value };
                  setRecipe(updated);
                }}
              />
              {r.source_type === 'ingredient' && r.source_id && r.unit && r.quantity ? (
                fixingIndex === index && fixData ? (
                  <>
                    <input
                      className="border p-1 rounded w-24"
                      placeholder="Factor"
                      value={fixData.suggested_factor}
                      onChange={(e) => setFixData(prev => ({ ...prev, suggested_factor: e.target.value }))}
                    />
                    <button
                      className="text-green-600"
                      type="button"
                      onClick={handleFixSave}
                    >Save</button>
                    <button
                      className="text-gray-500"
                      type="button"
                      onClick={() => setFixingIndex(null)}
                    >Cancel</button>
                  </>
                ) : (
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
                )
              ) : <span className="text-gray-400">–</span>}
              <button
                type="button"
                onClick={() => handleRemoveIngredient(index)}
                className="text-red-600"
              >✕</button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRecipe([...recipe, { source_type: '', source_id: '', quantity: '', unit: '', instructions: '' }])}
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
