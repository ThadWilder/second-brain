'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

interface ChartDataPoint {
  month: string
  cy: number | null
  py: number | null
}

interface TrendChartProps {
  data: ChartDataPoint[]
  title: string
  yoyGrowth?: number | null
  cyYear: number
  pyYear: number
  formatValue: (value: number) => string
}

function CustomTooltip({
  active,
  payload,
  label,
  formatValue,
  cyYear,
  pyYear,
}: {
  active?: boolean
  payload?: { value: number | null; dataKey: string; color: string }[]
  label?: string
  formatValue: (value: number) => string
  cyYear: number
  pyYear: number
}) {
  if (!active || !payload) return null
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="font-medium text-[var(--text)] mb-1">{label}</div>
      {payload.map((entry) => {
        if (entry.value == null) return null
        const yearLabel = entry.dataKey === 'cy' ? cyYear : pyYear
        return (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-0.5 rounded"
              style={{
                backgroundColor: entry.color,
                ...(entry.dataKey === 'py'
                  ? { borderTop: `1.5px dashed ${entry.color}`, backgroundColor: 'transparent' }
                  : {}),
              }}
            />
            <span className="text-[var(--muted)]">{yearLabel}:</span>
            <span className="font-medium text-[var(--text)] tabular-nums">
              {formatValue(entry.value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function TrendChart({
  data,
  title,
  yoyGrowth,
  cyYear,
  pyYear,
  formatValue,
}: TrendChartProps) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
        {yoyGrowth != null && (
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              yoyGrowth > 0
                ? 'text-[#437A22] bg-green-50'
                : yoyGrowth < 0
                  ? 'text-[#A12C7B] bg-pink-50'
                  : 'text-[var(--muted)] bg-gray-50'
            }`}
          >
            YoY {yoyGrowth > 0 ? '+' : ''}
            {yoyGrowth.toFixed(1)}%
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatValue(v)}
            width={60}
          />
          <Tooltip
            content={
              <CustomTooltip
                formatValue={formatValue}
                cyYear={cyYear}
                pyYear={pyYear}
              />
            }
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="plainline"
            wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
            formatter={(value: string) => (
              <span className="text-[var(--muted)]">
                {value === 'cy' ? cyYear : pyYear}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="py"
            stroke="#BAB9B4"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cy"
            stroke="#20808D"
            strokeWidth={2}
            dot={{ r: 3, fill: '#20808D', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#20808D', strokeWidth: 2, stroke: '#fff' }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
