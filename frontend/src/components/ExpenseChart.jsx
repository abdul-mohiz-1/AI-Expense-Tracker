/**
 * components/ExpenseChart.jsx — Recharts Financial Chart
 * ========================================================
 * Props:
 *   data     — [{ month, income, expense }]  (required)
 *   compact  — boolean, reduces height for dashboard sidebar
 *   type     — 'area' | 'bar' (default: 'area')
 */

import { useState } from 'react';
import {
  AreaChart, BarChart,
  Area, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 shadow-2xl shadow-slate-950/50 min-w-[140px]">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-xs text-slate-400 capitalize">{entry.name}</span>
          </div>
          <span className="text-xs font-bold text-white">
            {Number(entry.value).toLocaleString()}
          </span>
        </div>
      ))}
      {payload.length === 2 && (
        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500">Net</span>
          <span className={`text-xs font-black
            ${payload[0].value - payload[1].value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {(payload[0].value - payload[1].value).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Custom legend ─────────────────────────────────────────────────────────────
function CustomLegend({ payload }) {
  return (
    <div className="flex items-center justify-center gap-5 pt-3">
      {payload?.map((entry) => (
        <div key={entry.value} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: entry.color }} />
          <span className="text-xs text-slate-400 capitalize font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Y-axis formatter ──────────────────────────────────────────────────────────
function formatY(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000)    return `${(value / 1000).toFixed(0)}k`;
  return String(value);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExpenseChart({
  data    = [],
  compact = false,
  type    = 'area',
}) {
  const [chartType, setChartType] = useState(type);
  const height = compact ? 200 : 300;

  // Colour tokens
  const INCOME_COLOR  = '#34d399';  // emerald-400
  const EXPENSE_COLOR = '#f87171';  // red-400
  const INCOME_FILL   = '#10b98122';
  const EXPENSE_FILL  = '#ef444422';

  return (
    <div className="space-y-3">
      {/* Chart type toggle (only show in full/non-compact mode) */}
      {!compact && (
        <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1 w-fit">
          {['area', 'bar'].map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-150
                ${chartType === t
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              {t} Chart
            </button>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        {chartType === 'area' ? (
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={INCOME_COLOR}  stopOpacity={0.25} />
                <stop offset="95%" stopColor={INCOME_COLOR}  stopOpacity={0}    />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={EXPENSE_COLOR} stopOpacity={0.25} />
                <stop offset="95%" stopColor={EXPENSE_COLOR} stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tickFormatter={formatY}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              dx={-4}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />
            <Legend content={<CustomLegend />} />
            <Area
              type="monotone"
              dataKey="income"
              stroke={INCOME_COLOR}
              strokeWidth={2}
              fill="url(#incomeGrad)"
              dot={{ fill: INCOME_COLOR, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: INCOME_COLOR, strokeWidth: 2, stroke: '#0f172a' }}
            />
            <Area
              type="monotone"
              dataKey="expense"
              stroke={EXPENSE_COLOR}
              strokeWidth={2}
              fill="url(#expenseGrad)"
              dot={{ fill: EXPENSE_COLOR, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: EXPENSE_COLOR, strokeWidth: 2, stroke: '#0f172a' }}
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tickFormatter={formatY}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              dx={-4}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b66' }} />
            <Legend content={<CustomLegend />} />
            <Bar
              dataKey="income"
              fill={INCOME_COLOR}
              radius={[5, 5, 0, 0]}
              maxBarSize={28}
              fillOpacity={0.85}
            />
            <Bar
              dataKey="expense"
              fill={EXPENSE_COLOR}
              radius={[5, 5, 0, 0]}
              maxBarSize={28}
              fillOpacity={0.85}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}