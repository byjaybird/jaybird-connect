import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/auth';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function CostCell({ sourceType, sourceId, unit, qty, onMissing }) {
  const [costData, setCostData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!sourceType || !sourceId || !unit || !qty) return;

    async function fetchCost() {
      setLoading(true);
      try {
        const endpoint =
          sourceType === 'ingredient'
            ? `/api/ingredient_cost/${sourceId}?unit=${encodeURIComponent(unit)}&qty=${encodeURIComponent(qty)}`
            : `/api/item_cost/${sourceId}?unit=${encodeURIComponent(unit)}&qty=${encodeURIComponent(qty)}`;

        const res = await api.get(endpoint);
        setCostData(res.data);
      } catch (err) {
        console.error('Cost fetch failed', err.response || err);
        if (err.response) {
          setCostData({ status: 'error', message: `HTTP ${err.response.status}` });
        } else {
          setCostData({ status: 'error', message: 'Fetch error' });
        }
      } finally {
        setLoading(false);
      }
    }

    fetchCost();
  }, [sourceType, sourceId, unit, qty]);

  if (loading) return <span className="text-gray-400">…</span>;

  if (costData.status === 'ok') {
    return <span>${costData.total_cost.toFixed(2)}</span>;
  }

  const { from_unit, to_unit } = costData?.missing || {};
  const title = costData.message || 'Missing cost data';
  
  console.log('CostCell:', { costData });

  return (
    <span
      role="button"
      className="text-yellow-500 cursor-pointer hover:text-yellow-600"
      title={title}
      onClick={() => {
        if (onMissing) {
          onMissing({
            source_id: sourceId,
            from_unit,
            to_unit,
            reason: costData.message
          });
        } else {
          navigate(
            sourceType === 'ingredient'
              ? `/ingredients/${sourceId}/fix?from=${from_unit}&to=${to_unit}`
              : `/items/${sourceId}`
          );
        }
      }}
    >
      ⚠️
    </span>
  );
}

export default CostCell;
