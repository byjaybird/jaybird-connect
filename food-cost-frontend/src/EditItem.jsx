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
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    fetch(`${API_URL}/items/${id}`, {
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
    })
      .then(async (res) => {
        const responseBody = await res.text();
        if (res.ok) {
          alert('Item updated!');
          navigate('/');
        } else {
          console.error('Update failed:', res.status, responseBody);
          alert('Error updating item.');
        }
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        alert('Network error.');
      });
  };

  if (!item) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Edit Item</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-medium">Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block font-medium">Category</label>
          <input
            type="text"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block font-medium">Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="w-full border rounded p-2"
            rows={2}
          />
        </div>
        <div>
          <label className="block font-medium">Price</label>
          <input
            type="number"
            step="0.01"
            name="price"
            value={formData.price}
            onChange={handleChange}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block font-medium">Notes</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="w-full border rounded p-2"
            rows={2}
          />
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            name="is_prep"
            checked={formData.is_prep}
            onChange={handleChange}
          />
          <label className="font-medium">Is Prep Item</label>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            name="is_for_sale"
            checked={formData.is_for_sale}
            onChange={handleChange}
          />
          <label className="font-medium">Is For Sale</label>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            name="is_archived"
            checked={formData.is_archived}
            onChange={handleChange}
          />
          <label className="font-medium">Archived</label>
        </div>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
        >
          Save Changes
        </button>
      </form>
    </div>
  );
}

export default EditItem;
