import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import CostCell from './components/CostCell'; // adjust path as needed
import { QRCodeCanvas } from 'qrcode.react';  // You may need to install this library
import QRCode from 'qrcode.react';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function ItemDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [recipe, setRecipe] = useState([]);
  const [fixingIndex, setFixingIndex] = useState(null);
  const [fixData, setFixData] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/items/${id}`)
      .then((res) => res.json())
      .then(setItem);

    fetch(`${API_URL}/recipes/${id}`)
      .then((res) => res.json())
      .then(setRecipe);
  }, [id]);

  const handleDownloadLabel = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Define label dimensions: 3"x2.5" translates to 288px x 240px at 96 DPI
    canvas.width = 288;
    canvas.height = 240;

    // Set a white background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw QR Code
    const qrCodeCanvas = document.getElementById('qr-code');
    ctx.drawImage(qrCodeCanvas, 20, 20, 100, 100);

    // Add item name text
    ctx.fillStyle = '#000';
    ctx.font = '20px Arial';
    ctx.fillText(item.name, 140, 60);

    // Trigger download
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${item.name}-label.png`;
    link.click();
  };

  if (!item) return <div className="p-4">Loading item...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <div className="flex space-x-2">
          <Link to={`/item/${id}/edit`} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          ✏️ Edit Item
        </Link>
          <button onClick={handleDownloadLabel} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Get Label
          </button>
      </div>
      </div>

      <div style={{ display: 'none' }}>
        <QRCodeCanvas
          id="qr-code"
          value={`${API_URL}/items/${id}`}  // The value here can be customized
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
                    <Link to={`/items/${r.source_id}`} className="text-blue-600 hover:underline">
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
                    setFixingIndex(i); // use the loop index from `.map`
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
