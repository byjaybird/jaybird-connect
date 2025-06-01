import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';

function CostCell({ sourceType, sourceId, unit, qty, onMissing }) {
  const [costData, setCostData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  console.log('🔍 CostCell mounted', { sourceType, sourceId, unit, qty });

  useEffect(() => {
    if (!sourceType || !sourceId || !unit || !qty) return;

    async function fetchCost() {
      setLoading(true);
      try {
        const endpoint =
          sourceType === 'ingredient'
            ? `/ingredient_cost/${sourceId}?unit=${unit}&qty=${qty}`
            : `/item_cost/${sourceId}?unit=${unit}&qty=${qty}`;

        const res = await fetch(`${API_URL}${endpoint}`);

        if (!res.ok) {
          console.warn('Non-OK response:', res.status);
          setCostData({ status: 'error', message: `HTTP ${res.status}` });
          return;
        }

        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          console.error("Expected JSON, got HTML:", text.slice(0, 100));
          setCostData({ status: 'error', message: 'Invalid response format' });
          return;
        }

        const data = await res.json();
        setCostData(data);
      } catch (err) {
        console.error('Cost fetch failed', err);
        setCostData({ status: 'error', message: 'Fetch error' });
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
