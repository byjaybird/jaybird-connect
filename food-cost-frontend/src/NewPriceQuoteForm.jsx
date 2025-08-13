import React, { useState, useEffect } from 'react';
import { api } from './utils/auth';

function NewPriceQuoteForm() {
  const [ingredients, setIngredients] = useState([]);
  const [form, setForm] = useState({
    ingredient_id: '',
    source: '',
    size_qty: '',
    size_unit: '',
    price: '',
    date_found: '',
    notes: '',
    is_purchase: false
  });

  useEffect(() => {
    let mounted = true;
    async function loadIngredients() {
      try {
        const res = await api.get('/api/ingredients');
        const data = res.data;
        if (mounted) {
          setIngredients(data);
        }
      } catch (err) {
        console.error('Failed to load ingredients', err);
      }
    }
    loadIngredients();
    return () => { mounted = false; };
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...form,
      ingredient_id: parseInt(form.ingredient_id, 10),
      size_qty: parseFloat(form.size_qty),
      price: parseFloat(form.price)
    };

    try {
      const res = await api.post('/api/price_quotes', payload);
      const data = res.data;
      if (res.status === 201 || res.status === 200) {
        alert('Price quote added!');
        setForm({
          ingredient_id: '',
          source: '',
          size_qty: '',
          size_unit: '',
          price: '',
          date_found: '',
          notes: '',
          is_purchase: false
        });
      } else {
        alert(`Error: ${data?.error}`);
      }
    } catch (err) {
      console.error('Error creating price quote', err.response || err);
      alert(err.response?.data?.error || 'Failed to create price quote');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-md">
      <h2 className="text-xl font-bold">New Price Quote</h2>

      <label className="block">
        Ingredient:
        <select name="ingredient_id" value={form.ingredient_id} onChange={handleChange} required className="w-full border p-2">
          <option value="">Select one</option>
          {ingredients.map(ing => (
            <option key={ing.ingredient_id} value={ing.ingredient_id}>
              {ing.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        Source:
        <input type="text" name="source" value={form.source} onChange={handleChange} required className="w-full border p-2" />
      </label>

      <label className="block">
        Size Quantity:
        <input type="number" name="size_qty" value={form.size_qty} onChange={handleChange} required step="any" className="w-full border p-2" />
      </label>

      <label className="block">
        Size Unit:
        <select name="size_unit" value={form.size_unit} onChange={handleChange} required className="w-full border p-2">
          <option value="">Select unit</option>
          <option value="oz">oz</option>
          <option value="lb">lb</option>
          <option value="qt">qt</option>
          <option value="gal">gal</option>
          <option value="each">each</option>
          <option value="dozen">dozen</option>
          <option value="g">g</option>
          <option value="kg">kg</option>
          <option value="ml">ml</option>
          <option value="l">l</option>
          <option value="slice">slice</option>
          <option value="case">case</option>
          <option value="pack">pack</option>
          <option value="unit">unit</option>
        </select>
      </label>


      <label className="block">
        Price:
        <input type="number" name="price" value={form.price} onChange={handleChange} required step="0.01" className="w-full border p-2" />
      </label>

      <label className="block">
        Date Found:
        <input type="date" name="date_found" value={form.date_found} onChange={handleChange} className="w-full border p-2" />
      </label>

      <label className="block">
        Notes:
        <textarea name="notes" value={form.notes} onChange={handleChange} className="w-full border p-2" />
      </label>

      <label className="block">
        <input type="checkbox" name="is_purchase" checked={form.is_purchase} onChange={handleChange} />
        {' '}Was this actually purchased?
      </label>

      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
        Add Quote
      </button>
    </form>
  );
}

export default NewPriceQuoteForm;
