import React from 'react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function ItemSalesMarginChart({ data, height = 220 }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-sm text-gray-500">No sales history yet.</div>;
  }

  const salesValues = data.map((row) => Number(row?.gross_sales) || 0);
  const marginValues = data
    .map((row) => row?.margin_pct)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => Number(value) || 0);

  const chartWidth = 100;
  const leftPad = 10;
  const rightPad = 10;
  const topPad = 14;
  const bottomPad = 22;
  const plotHeight = height - topPad - bottomPad;
  const plotWidth = chartWidth - leftPad - rightPad;
  const salesMax = Math.max(...salesValues, 1);
  const marginMin = marginValues.length ? Math.min(...marginValues, 0) : 0;
  const marginMax = marginValues.length ? Math.max(...marginValues, 0) : 100;
  const marginRange = marginMax - marginMin || 1;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const barWidth = Math.max(1.8, Math.min(5, plotWidth / Math.max(data.length * 1.8, 1)));

  const salesY = (value) => topPad + plotHeight - ((value / salesMax) * plotHeight);
  const marginY = (value) => topPad + plotHeight - (((value - marginMin) / marginRange) * plotHeight);
  const xFor = (index) => leftPad + (data.length === 1 ? plotWidth / 2 : index * step);

  const marginPoints = data
    .filter((row) => row?.margin_pct !== null && row?.margin_pct !== undefined)
    .map((row, index) => `${xFor(index)},${marginY(Number(row.margin_pct) || 0)}`)
    .join(' ');

  const xLabels = [
    { index: 0, anchor: 'start' },
    { index: Math.floor((data.length - 1) / 2), anchor: 'middle' },
    { index: data.length - 1, anchor: 'end' }
  ].filter((label, idx, arr) => arr.findIndex((candidate) => candidate.index === label.index) === idx);

  return (
    <div className="rounded border bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
          Gross sales
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 bg-emerald-600" />
          Margin %
        </span>
      </div>
      <svg
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        height={height}
        role="img"
        aria-label="Gross sales and margin percentage over time"
      >
        <line x1={leftPad} y1={topPad} x2={leftPad} y2={topPad + plotHeight} stroke="#94a3b8" strokeWidth="0.4" />
        <line x1={chartWidth - rightPad} y1={topPad} x2={chartWidth - rightPad} y2={topPad + plotHeight} stroke="#94a3b8" strokeWidth="0.4" />
        <line x1={leftPad} y1={topPad + plotHeight} x2={chartWidth - rightPad} y2={topPad + plotHeight} stroke="#cbd5e1" strokeWidth="0.4" />

        {[0, 0.5, 1].map((tick) => {
          const y = topPad + plotHeight - (tick * plotHeight);
          return (
            <line
              key={tick}
              x1={leftPad}
              y1={y}
              x2={chartWidth - rightPad}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="0.35"
              strokeDasharray="1.2 1.2"
            />
          );
        })}

        {data.map((row, index) => {
          const sales = Number(row?.gross_sales) || 0;
          const x = xFor(index);
          const y = salesY(sales);
          const barHeight = clamp(topPad + plotHeight - y, 0, plotHeight);
          return (
            <rect
              key={row.business_date}
              x={x - barWidth / 2}
              y={y}
              width={barWidth}
              height={barHeight}
              fill="#60a5fa"
              opacity="0.85"
              rx="0.6"
            />
          );
        })}

        {marginPoints && (
          <polyline
            fill="none"
            stroke="#059669"
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={marginPoints}
          />
        )}

        {data.map((row, index) => {
          if (row?.margin_pct === null || row?.margin_pct === undefined) return null;
          return (
            <circle
              key={`${row.business_date}-margin`}
              cx={xFor(index)}
              cy={marginY(Number(row.margin_pct) || 0)}
              r="0.9"
              fill="#047857"
            />
          );
        })}

        <text x={1.5} y={topPad + 3} fontSize="3.2" fill="#475569">Sales</text>
        <text x={1.5} y={topPad + plotHeight} fontSize="3.2" fill="#64748b">$0</text>
        <text x={1.5} y={topPad + 10} fontSize="3.2" fill="#64748b">${salesMax.toFixed(0)}</text>

        <text x={chartWidth - 8.5} y={topPad + 3} fontSize="3.2" fill="#475569">Margin %</text>
        <text x={chartWidth - 8.5} y={topPad + 10} fontSize="3.2" fill="#64748b">{marginMax.toFixed(0)}%</text>
        <text x={chartWidth - 8.5} y={topPad + plotHeight} fontSize="3.2" fill="#64748b">{marginMin.toFixed(0)}%</text>

        {xLabels.map((label) => {
          const row = data[label.index];
          const date = row?.business_date ? row.business_date.slice(5) : '';
          return (
            <text
              key={`${label.index}-${date}`}
              x={xFor(label.index)}
              y={height - 5}
              textAnchor={label.anchor}
              fontSize="3.1"
              fill="#6b7280"
            >
              {date}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
