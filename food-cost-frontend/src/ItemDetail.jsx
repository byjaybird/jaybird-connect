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
  const [editingYield, setEditingYield] = useState(false);
  const [yieldQtyEdit, setYieldQtyEdit] = useState('');
  const [yieldUnitEdit, setYieldUnitEdit] = useState('');
  const [itemCost, setItemCost] = useState(null);
  const [itemTotalCost, setItemTotalCost] = useState(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState(null);

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

        // Try to fetch computed cost for this item (if available)
        try {
          const unit = itemRes.data?.yield_unit || '';
          // fetch cost per unit
          const costRes = await api.get(`/api/item_cost/${id}?unit=${encodeURIComponent(unit)}&qty=1`);
          if (mounted) setItemCost(costRes.data);

          // If item has a yield quantity, fetch total cost for the full yield
          if (itemRes.data?.yield_qty) {
            const totalRes = await api.get(`/api/item_cost/${id}?unit=${encodeURIComponent(unit)}&qty=${encodeURIComponent(itemRes.data.yield_qty)}`);
            if (mounted) setItemTotalCost(totalRes.data);
          }
        } catch (e) {
          // non-fatal
          console.warn('Failed to fetch item cost', e?.response || e);
        }
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

  const startEditYield = () => {
    setYieldQtyEdit(item?.yield_qty ?? '');
    setYieldUnitEdit(item?.yield_unit ?? '');
    setEditingYield(true);
  };

  const cancelEditYield = () => {
    setEditingYield(false);
  };

  const saveYield = async () => {
    try {
      const payload = {
        name: item.name,
        category: item.category,
        is_prep: item.is_prep,
        is_for_sale: item.is_for_sale,
        price: item.price,
        description: item.description,
        process_notes: item.process_notes,
        archived: item.archived ?? item.is_archived ?? false,
        yield_qty: yieldQtyEdit === '' || yieldQtyEdit === null ? null : parseFloat(yieldQtyEdit),
        yield_unit: yieldUnitEdit || null
      };

      const res = await api.put(`/api/items/${id}`, payload);
      if (!res.ok && res.status !== 200) {
        console.error('Failed saving yield', res);
        alert('Failed to save yield');
        return;
      }

      // Update local state
      setItem(prev => ({ ...prev, yield_qty: payload.yield_qty, yield_unit: payload.yield_unit }));
      setEditingYield(false);
    } catch (err) {
      console.error('Error saving yield', err);
      alert('Failed to save yield');
    }
  };

  const handleRecalculate = async () => {
    if (!item) return;
    setRecalcLoading(true);
    setRecalcMessage(null);
    try {
      const res = await api.post(`/api/items/${id}/recalculate_cost`);
      const data = res.data || {};
      if (data.status === 'ok' && data.cost_per_unit !== undefined) {
        // Update stored cost locally
        setItem(prev => ({ ...prev, cost: data.cost_per_unit }));
        setRecalcMessage('Recalculation succeeded');
      } else if (data.status === 'not_prep_item') {
        setRecalcMessage(data.message || 'Item is not a prep item');
      } else {
        // Server may return detailed error structure
        setRecalcMessage(JSON.stringify(data));
      }

      // Refresh computed cost display if possible
      try {
        const unit = item?.yield_unit || '';
        const costRes = await api.get(`/api/item_cost/${id}?unit=${encodeURIComponent(unit)}&qty=1`);
        setItemCost(costRes.data);
        if (item?.yield_qty) {
          const totalRes = await api.get(`/api/item_cost/${id}?unit=${encodeURIComponent(unit)}&qty=${encodeURIComponent(item.yield_qty)}`);
          setItemTotalCost(totalRes.data);
        }
      } catch (e) {
        console.warn('Failed to refresh item cost after recalc', e?.response || e);
      }
    } catch (err) {
      console.error('Recalc failed', err?.response || err);
      setRecalcMessage(err.response?.data || err.message || 'Recalc failed');
    } finally {
      setRecalcLoading(false);
    }
  };

  if (!item) return <div className="p-4">Loading item...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">{item.name}</h1>
          <div className="text-sm text-gray-600">
            <strong>Yield:</strong>{' '}
            {!editingYield ? (
              <span>
                {item?.yield_qty ? `${item.yield_qty}${item.yield_unit ? ' ' + item.yield_unit : ''}` : '—'}
                {allowedEdit && (
                  <button onClick={startEditYield} className="ml-2 text-blue-600">✏️</button>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  value={yieldQtyEdit}
                  onChange={(e) => setYieldQtyEdit(e.target.value)}
                  className="border p-1 rounded w-24"
                />
                <input
                  value={yieldUnitEdit}
                  onChange={(e) => setYieldUnitEdit(e.target.value)}
                  placeholder="unit (e.g., each, liter)"
                  className="border p-1 rounded w-36"
                />
                <button onClick={saveYield} className="text-green-600">Save</button>
                <button onClick={cancelEditYield} className="text-gray-500">Cancel</button>
              </span>
            )}
          </div>
        </div>
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
      <p className="mb-2"><strong>Stored Cost:</strong> {item.cost !== undefined && item.cost !== null ? (
        <span>${Number(item.cost).toFixed(4)}</span>
      ) : (
        <span className="text-gray-500">—</span>
      )}
        <button
          onClick={handleRecalculate}
          disabled={recalcLoading}
          className="ml-3 bg-yellow-500 text-white px-2 py-1 rounded text-sm hover:bg-yellow-600"
        >{recalcLoading ? 'Recalculating…' : 'Recalculate'}</button>
      </p>

      <p className="mb-2"><strong>Computed Cost:</strong> {itemCost ? (
        itemCost.status === 'ok' ? (
          <span>${Number(itemCost.cost_per_unit).toFixed(4)} per {item?.yield_unit || itemCost.recipe_unit || 'unit'}</span>
        ) : (
          <span className="text-red-600">{itemCost.message || itemCost.issue || 'Unable to compute cost'}</span>
        )
      ) : '—'}</p>
      {itemTotalCost && itemTotalCost.status === 'ok' && (
        <p className="mb-2"><strong>Total Cost for Yield ({item.yield_qty} {item.yield_unit}):</strong> ${Number(itemTotalCost.total_cost).toFixed(4)}</p>
      )}
      {recalcMessage && (
        <p className="text-sm text-gray-700">{typeof recalcMessage === 'string' ? recalcMessage : JSON.stringify(recalcMessage)}</p>
      )}
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

