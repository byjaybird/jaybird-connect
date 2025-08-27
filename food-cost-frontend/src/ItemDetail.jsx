import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import CostCell from './components/CostCell';
import { QRCodeCanvas } from 'qrcode.react';
import { API_URL } from './config';
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

function ItemDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [recipe, setRecipe] = useState([]);
  const [fixingIndex, setFixingIndex] = useState(null);
  const [fixData, setFixData] = useState(null);
  const [user, setUser] = useState(getLocalUser());
  const [allowedEdit, setAllowedEdit] = useState(false);

  useEffect(() => {
    setAllowedEdit(canEdit(user, 'items'));
  }, [user]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [itemRes, recipeRes] = await Promise.all([
          api.get(`/api/items/${id}`),
          api.get(`/api/recipes/${id}`)
        ]);
        if (!mounted) return;
        setItem(itemRes.data);
        setRecipe(recipeRes.data || []);
      } catch (err) {
        console.error('Failed to load item/recipe', err.response || err);
      }
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  const handlePrintLabel = async () => {
    try {
      const itemId = item.item_id || item.id;
      const yieldStr = item?.yield_qty ? `${item.yield_qty}${item.yield_unit ? ' ' + item.yield_unit : ''}` : '';
      const payload = {
        item_id: itemId,
        name: item.name,
        yield: yieldStr,
        barcode: item.barcode || `JB-ITEM-${String(itemId).padStart(6, '0')}`,
        roll: 'left'
      };

      await api.post('/api/print-label', payload);
      alert('Print request sent to server');
    } catch (err) {
      console.error('Failed to send print request', err?.response || err);
      alert('Failed to send print request');
    }
  };

  if (!item) return <div className="p-4">Loading item...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <div className="flex space-x-2">
          {allowedEdit && (
            <Link to={`/item/${id}/edit`} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              ✏️ Edit Item
            </Link>
          )}
          <button onClick={handlePrintLabel} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Print Label
          </button>
        </div>
      </div>

      <div style={{ display: 'none' }}>
        <QRCodeCanvas
          id="qr-code"
          value={`${API_URL}/api/items/${id}`}
          size={100}
          level={"H"}
          includeMargin={true}
        />
      </div>

      <p className="mb-2"><strong>Category:</strong> {item.category}</p>
      <p className="mb-2"><strong>Description:</strong> {item.description}</p>
      <p className="mb-2"><strong>Notes:</strong> {item.process_notes}</p>
      <p className="mb-2"><strong>Price:</strong> ${item.price?.toFixed(2) ?? 'N/A'}</p>
      <p className="mb-2">
        <strong>Flags:</strong>{' '}
        {item.is_prep ? 'Prep' : ''}{' '}
        {item.is_for_sale ? 'For Sale' : ''}{' '}
        {item.is_archived ? '(Archived)' : ''}
      </p>

      <div className="mt-4">
        <h2 className="text-xl font-semibold mb-2">Recipe</h2>
        {recipe.length > 0 ? (
          <ul className="list-disc list-inside">
            {recipe.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span>
                  {r.quantity} {r.unit} of{' '}
                  {r.source_type === 'item' ? (
                    <Link to={`/item/${r.source_id}`} className="text-blue-600 hover:underline">
                      {r.source_name}
                    </Link>
                  ) : (
                    <Link to={`/ingredients/${r.source_id}`} className="text-blue-600 hover:underline">
                      {r.source_name}
                    </Link>
                  )}
                </span>
                <CostCell
                  sourceType={r.source_type}
                  sourceId={r.source_id}
                  unit={r.unit}
                  qty={r.quantity}
                  onMissing={(data) => {
                    setFixingIndex(i);
                    setFixData(data);
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p>No ingredients listed.</p>
        )}
      </div>
    </div>
  );
}

export default ItemDetail;

