import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import ManualInventoryAdd from './ManualInventoryAdd';

export default function ManualInventoryPage() {
  const navigate = useNavigate();

  const handleSaved = (count) => {
    // navigate back to inventory and add a reload query to force the dashboard to refresh
    navigate('/inventory?reload=' + Date.now());
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <Link to="/inventory" className="text-sm text-gray-600 hover:text-black">← Back to Inventory</Link>
        </div>
        <h1 className="text-2xl font-bold">Manual Inventory Entry</h1>
        <div />
      </div>

      <ManualInventoryAdd onSaved={handleSaved} />
    </div>
  );
}
