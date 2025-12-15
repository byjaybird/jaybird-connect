import React from 'react';

export default function SalesSparkline({ data, accessor = 'net_sales', height = 60, stroke = '#2563eb' }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-sm text-gray-500">No sales history yet.</div>;
  }

  const values = data.map((row) => Number(row?.[accessor]) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const viewWidth = 100;
  const steps = Math.max(values.length - 1, 1);
  const stepSize = steps === 0 ? 0 : viewWidth / steps;
  const yFor = (val) => {
    const normalized = (val - min) / range;
    return height - normalized * height;
  };

  const coords = values.map((value, idx) => {
    const x = values.length === 1 ? viewWidth / 2 : idx * stepSize;
    const y = yFor(value);
    return `${x},${y}`;
  });

  // Ensure the path renders even with a single point
  const points = values.length === 1 ? `${coords[0]} ${coords[0]}` : coords.join(' ');

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      height={height}
      role="img"
      aria-label="Sales trend sparkline"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
