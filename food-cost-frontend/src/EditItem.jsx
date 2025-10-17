import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CostCell from './components/CostCell';
import Select from 'react-select';
import { api } from './utils/auth';
import { canEdit } from './utils/permissions';

function getLocalUser() {
  try {
    const raw = localStorage.getItem('appUser');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

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
    cost: '',
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
  const [user, setUser] = useState(getLocalUser());
  const [allowedEdit, setAllowedEdit] = useState(false);

  const mapRecipeToOptions = (r) => {
    if (r.source_type === 'ingredient') {
      const ingredient = ingredients.find(i => i.ingredient_id === r.source_id);
      const labelName = ingredient ? ingredient.name : (r.source_name || 'Unnamed Ingredient');
      return { value: `ingredient:${r.source_id}`, label: `🧂 ${labelName || 'Unnamed Ingredient'}` };
    } else {
      const item = prepItems.find(i => i.item_id === r.source_id);
      const labelName = item ? item.name : (r.source_name || 'Unnamed Prep Item');
      return { value: `item:${r.source_id}`, label: `🛠️ ${labelName || 'Unnamed Prep Item'}` };
    }
  };

  useEffect(() => {
    setAllowedEdit(canEdit(user, 'items'));
  }, [user]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const itemRes = await api.get(`/api/items/${id}`);
        if (mounted) {
          const data = itemRes.data;
          setItem(data);
          setFormData({
            name: data.name || '',
            category: data.category || '',
            is_prep: !!data.is_prep,
            is_for_sale: !!data.is_for_sale,
            price: data.price ?? '',
            cost: data.cost ?? '',
            description: data.description || '',
            notes: data.process_notes || '',
            is_archived: !!data.archived,
            yield_qty: data.yield_qty ?? '',
            yield_unit: data.yield_unit ?? ''
          });
        }

        const ingRes = await api.get('/api/ingredients');
        const active = (ingRes.data || []).filter(i => !i.archived);
        const sortedIngredients = active.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        if (mounted) setIngredients(sortedIngredients);

        const itemResAll = await api.get('/api/items');
        const preps = (itemResAll.data || []).filter(i => i.is_prep && !i.is_archived);
        const sortedPreps = preps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        if (mounted) setPrepItems(sortedPreps);

        const recipeRes = await api.get(`/api/recipes/${id}`);
        if (mounted) setRecipe(recipeRes.data);
      } catch (err) {
        console.error('EditItem load error', err);
      }
    }
    load();
    return () => { mounted = false; };
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
    try {
      const res = await api.post('/api/ingredient_conversions', {
        ingredient_id: recipe[fixingIndex].source_id,
        from_unit: fixData.from_unit,
        to_unit: fixData.to_unit,
        // store as `factor` (how many `to_unit` in 1 `from_unit`)
        factor: parseFloat(fixData.suggested_factor)
      });
      setFixingIndex(null);
      setFixData(null);
    } catch (err) {
      console.error('Failed to save conversion', err);
      alert('Failed to save conversion');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allowedEdit) return alert('You do not have permission to edit this item');
    try {
      await api.put(`/api/items/${id}`, {
        name: formData.name,
        category: formData.category,
        is_prep: formData.is_prep,
        is_for_sale: formData.is_for_sale,
        price: formData.price === '' ? null : parseFloat(formData.price),
        cost: formData.cost === '' ? null : parseFloat(formData.cost),
        description: formData.description,
        process_notes: formData.notes,
        is_archived: formData.is_archived,
        yield_qty: formData.is_prep ? formData.yield_qty : null,
        yield_unit: formData.is_prep ? formData.yield_unit : null
      });
      // axios throws for non-2xx responses, so if we reach here the update succeeded
    } catch (err) {
      const error = err.response?.data || {};
      alert(error.error || 'Failed to update item');
      return;
    }

    // Normalize recipe entries to the API shape and filter invalid/duplicate rows
    const seen = new Set();
    const cleaned = recipe
      .map((r) => {
        // support legacy shapes (ingredient_id / item_id) and current (source_type/source_id)
        const source_type = r.source_type || (r.ingredient_id ? 'ingredient' : (r.item_id ? 'item' : ''));
        const source_id = r.source_id || r.ingredient_id || r.item_id;
        return {
          source_type,
          source_id: source_id !== undefined && source_id !== '' ? parseInt(source_id) : null,
          quantity: r.quantity,
          unit: (r.unit || '').trim(),
          instructions: r.instructions || null
        };
      })
      .filter((r) => {
        if (!r.source_type || !r.source_id) return false;
        if (r.quantity === '' || r.quantity === null || r.quantity === undefined) return false;
        if (!r.unit) return false;
        const key = `${r.source_type}:${r.source_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    try {
      await api.delete(`/api/recipes/${id}`);
    } catch (err) {
      console.error('Failed to delete existing recipe', err);
      alert('Failed to clear existing recipe. Please try again.');
      return;
    }

    try {
      if (cleaned.length > 0) {
        await api.post(`/api/recipes`, {
          item_id: parseInt(id),
          recipe: cleaned
        });
      }
    } catch (err) {
      console.error('Failed to save recipe', err);
      const error = err.response?.data || {};
      alert(error.error || 'Failed to save recipe. Please try again.');
      return;
    }

    navigate(`/item/${id}`);
  };

  const handleAddNewIngredient = async () => {
    if (!allowedEdit) return alert('You do not have permission to create ingredients');
    if (!newIngredientName.trim()) return;
    try {
      const res = await api.post('/api/ingredients', { name: newIngredientName, category: '', notes: '', unit: '' });
      const data = res.data;
      if (res.status === 200 || res.status === 201) {
        const newList = [...ingredients, data].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setIngredients(newList);
        // add to recipe using the API shape (source_type / source_id)
        setRecipe((prev) => ([...prev, { source_type: 'ingredient', source_id: data.ingredient_id, quantity: '', unit: '', instructions: '' }]));
        setNewIngredientName('');
      }
    } catch (err) {
      console.error('Failed to create ingredient', err);
      alert('Failed to create ingredient');
    }
  };

  const handleRemoveIngredient = (index) => {
    if (!allowedEdit) return alert('You do not have permission to edit the recipe');
    setRecipe(prev => prev.filter((_, i) => i !== index));
  };

  const handleArchive = async () => {
    if (!allowedEdit) return alert('You do not have permission to archive this item');
    if (!window.confirm('Are you sure you want to archive this item? This will hide it from lists.')) return;
    try {
      await api.delete(`/api/items/${id}`);
      navigate('/items');
    } catch (err) {
      console.error('Failed to archive item', err);
      alert('Failed to archive item');
    }
  };

  if (!item) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Edit Item</h1>
      {!allowedEdit && <div className="mb-4 text-yellow-700">You can view this item but you do not have permission to change it.</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input name="name" value={formData.name} onChange={handleChange} placeholder="Name" className="w-full border p-2 rounded" required />
        <input name="category" value={formData.category} onChange={handleChange} placeholder="Category" className="w-full border p-2 rounded" />
        <input name="price" value={formData.price} onChange={handleChange} placeholder="Price" type="number" step="0.01" className="w-full border p-2 rounded" autocomplete="off" />
        <input name="cost" value={formData.cost} onChange={handleChange} placeholder="Cost (stored)" type="number" step="0.0001" className="w-full border p-2 rounded" autocomplete="off" />
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
          <h2 className="text-xl font-semibold mb-2">Recipe Ingredients</h2>
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
                  if (!allowedEdit) return alert('You do not have permission to edit this recipe');
                  const [type, id] = selected.value.split(':');
                  const updated = [...recipe];
                  updated[index] = { ...updated[index], source_type: type, source_id: parseInt(id) };
                  setRecipe(updated);
                }}
                options={[
                  {
                    label: '🧂 Ingredients',
                    options: ingredients
                      .filter((i) => (i.name || '').toLowerCase().includes(filterText.toLowerCase()))
                      .map((i) => ({
                        value: `ingredient:${i.ingredient_id}`,
                        label: `🧂 ${i.name || 'Unnamed Ingredient'}`
                      }))
                  },
                  {
                    label: '🛠️ Prep Items',
                    options: prepItems
                      .filter((i) => (i.name || '').toLowerCase().includes(filterText.toLowerCase()))
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
                  if (!allowedEdit) return alert('You do not have permission to edit the recipe');
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
                  if (!allowedEdit) return alert('You do not have permission to edit the recipe');
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
        <div className="flex gap-2">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded" disabled={!allowedEdit}>Save Changes</button>
          {!formData.is_archived ? (
            <button type="button" className="bg-red-600 text-white px-4 py-2 rounded" onClick={handleArchive} disabled={!allowedEdit}>Archive Item</button>
          ) : (
            <button type="button" className="bg-gray-400 text-white px-4 py-2 rounded" disabled>Archived</button>
          )}
        </div>
      </form>
    </div>
  );
}

export default EditItem;
