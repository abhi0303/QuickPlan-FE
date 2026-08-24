import { colorFor } from './palette'
import './Charts.scss'

/**
 * Three small SVG charts.
 *
 * Hand-drawn rather than pulled from a chart library: these are the only three
 * shapes the app needs, they inherit the theme's own tokens, and a charting
 * dependency would be larger than the whole bundle it joined.
 */

type DonutSlice = { label: string, value: number, share: number }

/**
 * Donut built from one circle per slice, each rotated into place with a
 * dash offset — no path arithmetic, and it animates from zero for free.
 */
export function DonutChart({
  slices, total, caption, format,
}: {
  slices: DonutSlice[]
  total: number
  caption: string
  format: (value: number) => string
}) {
  const radius = 60
  const circumference = 2 * Math.PI * radius

  // each slice needs to know how much of the ring precedes it; a running total
  // reduced up front keeps the render pure
  const lengths = slices.map((slice) => (slice.share / 100) * circumference)
  const starts = lengths.reduce<number[]>(
    (acc, _length, index) => [...acc, (acc[index - 1] ?? 0) + (lengths[index - 1] ?? 0)],
    [],
  )

  return (
    <div className="chart-donut">
      <svg viewBox="0 0 160 160" role="img" aria-label={caption}>
        <circle className="donut-track" cx="80" cy="80" r={radius} strokeWidth="22" fill="none" />
        {slices.map((slice, index) => {
          const length = lengths[index]
          const dash = `${length} ${circumference - length}`
          const rotation = (starts[index] / circumference) * 360 - 90
          return (
            <circle
              key={slice.label}
              cx="80" cy="80" r={radius}
              fill="none"
              strokeWidth="22"
              stroke={colorFor(slice.label, index)}
              strokeDasharray={dash}
              strokeLinecap="butt"
              transform={`rotate(${rotation} 80 80)`}
            />
          )
        })}
      </svg>

      <div className="donut-center">
        <strong>{format(total)}</strong>
        <small>{caption}</small>
      </div>
    </div>
  )
}

export function ChartLegend({
  slices, format,
}: {
  slices: DonutSlice[]
  format: (value: number) => string
}) {
  return (
    <ul className="chart-legend">
      {slices.map((slice, index) => (
        <li key={slice.label}>
          <i style={{ background: colorFor(slice.label, index) }} />
          <span className="legend-label">{slice.label}</span>
          <span className="legend-value">{format(slice.value)}</span>
          <span className="legend-share">{slice.share.toFixed(0)}%</span>
        </li>
      ))}
    </ul>
  )
}

type BarRow = { label: string, value: number, secondary?: number, hint?: string }

/**
 * Horizontal bars. A second value renders as a ghost behind the first, which is
 * how "paid against fair share" reads in one row instead of two charts.
 */
export function BarList({
  rows, format, primaryLabel, secondaryLabel,
}: {
  rows: BarRow[]
  format: (value: number) => string
  primaryLabel?: string
  secondaryLabel?: string
}) {
  const peak = Math.max(1, ...rows.flatMap((row) => [row.value, row.secondary ?? 0]))

  return (
    <div className="chart-bars">
      {(primaryLabel || secondaryLabel) && (
        <div className="bars-key">
          {primaryLabel && <span><i className="swatch primary" /> {primaryLabel}</span>}
          {secondaryLabel && <span><i className="swatch ghost" /> {secondaryLabel}</span>}
        </div>
      )}

      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span className="bar-label" title={row.label}>{row.label}</span>
          <span className="bar-track">
            {row.secondary !== undefined && (
              <i className="bar-ghost" style={{ width: `${(row.secondary / peak) * 100}%` }} />
            )}
            <i className="bar-fill" style={{ width: `${(row.value / peak) * 100}%` }} />
          </span>
          <span className="bar-value">{format(row.value)}{row.hint && <small>{row.hint}</small>}</span>
        </div>
      ))}
    </div>
  )
}

type ColumnDatum = { key: string, label: string, sub?: string, value: number, at?: Date, now?: boolean }

/**
 * Vertical bars, one per bucket.
 *
 * Empty buckets keep their column rather than being dropped: a week with no
 * spending is a fact about the week, and leaving it out would silently compress
 * the timeline. A column that can be opened is a button; one that cannot is not.
 */
export function ColumnChart({
  columns, format, onOpen,
}: {
  columns: ColumnDatum[]
  format: (value: number) => string
  onOpen?: (column: ColumnDatum) => void
}) {
  const peak = Math.max(1, ...columns.map((column) => column.value))

  return (
    <div className={`chart-columns ${columns.length > 12 ? 'is-dense' : ''}`}>
      {columns.map((column) => {
        const openable = Boolean(onOpen && column.at)
        const height = column.value > 0 ? Math.max(3, (column.value / peak) * 100) : 0

        const inner = (
          <>
            <span className="col-amount">{column.value > 0 ? format(column.value) : ''}</span>
            <span className="col-track">
              <i className="col-fill" style={{ height: `${height}%` }} />
            </span>
            <span className="col-label">{column.label}</span>
            {column.sub && <span className="col-sub">{column.sub}</span>}
          </>
        )

        const className = `chart-column ${column.now ? 'is-now' : ''} ${column.value === 0 ? 'is-empty' : ''}`

        return openable ? (
          <button
            type="button"
            key={column.key}
            className={className}
            onClick={() => onOpen?.(column)}
            title={`${column.label}: ${format(column.value)} — open`}
          >
            {inner}
          </button>
        ) : (
          <div key={column.key} className={className} title={`${column.label}: ${format(column.value)}`}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
