import { format, isSameDay } from 'date-fns'
import type { Forecast } from '../../services/forecast'
import './ForecastChart.scss'

/**
 * The balance, day by day.
 *
 * A line rather than bars because the reader is looking for a *shape* — where
 * it falls off a cliff, and whether it climbs back. Only charge days are
 * marked, and anything below zero is filled, because that is the part somebody
 * needs to see from across the room.
 */

const W = 720
const H = 190
const PAD = { top: 16, right: 8, bottom: 22, left: 8 }

const money = (value: number) => `₹${Math.round(Math.abs(value)).toLocaleString('en-IN')}`

export function ForecastChart({ forecast }: { forecast: Forecast }) {
  const { days } = forecast
  if (days.length === 0) return null

  const values = days.map((day) => day.balance)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1

  const x = (index: number) => PAD.left + (index / Math.max(1, days.length - 1)) * (W - PAD.left - PAD.right)
  const y = (value: number) => PAD.top + (1 - (value - min) / span) * (H - PAD.top - PAD.bottom)

  const line = days.map((day, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(day.balance)}`).join(' ')
  const area = `${line} L ${x(days.length - 1)} ${y(min)} L ${x(0)} ${y(min)} Z`
  const zeroY = y(0)

  /*
   * The marked day is the one the headline is about. When the balance goes
   * under, that is the day it happens — not the lowest point weeks later, which
   * would put the dot somewhere the sentence never mentions.
   */
  const marked = forecast.shortfall ?? forecast.low
  const markedIndex = marked ? days.findIndex((day) => isSameDay(day.date, marked.date)) : -1

  // only the days something is scheduled get a dot; a dot a day is noise
  const marks = days
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => day.charges.length > 0)

  /**
   * A label every fortnight, plus the ends — but a fortnightly tick that lands
   * close to the last one would overlap it, so the end wins.
   */
  const last = days.length - 1
  const ticks = days
    .map((day, index) => ({ day, index }))
    .filter(({ index }) => index === 0 || index === last || (index % 14 === 0 && last - index > 7))

  return (
    <div className="forecast-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label="Your balance over the next two months">
        <path className="fc-area" d={area} />
        {min < 0 && (
          <>
            <rect className="fc-under" x={0} y={zeroY} width={W} height={Math.max(0, H - PAD.bottom - zeroY)} />
            <line className="fc-zero" x1={0} x2={W} y1={zeroY} y2={zeroY} />
          </>
        )}
        <path className="fc-line" d={line} />

        {marks.map(({ day, index }) => (
          <circle key={day.date.toISOString()} className="fc-mark" cx={x(index)} cy={y(day.balance)} r={3.5} />
        ))}

        {markedIndex >= 0 && (
          <circle className="fc-low" cx={x(markedIndex)} cy={y(days[markedIndex].balance)} r={5} />
        )}
      </svg>

      <div className="fc-axis">
        {ticks.map(({ day, index }) => (
          <span key={day.date.toISOString()} style={{ left: `${(x(index) / W) * 100}%` }}>
            {format(day.date, 'd MMM')}
          </span>
        ))}
      </div>

      {marked && (
        <p className="fc-caption">
          <i className="fc-key-low" />
          {forecast.shortfall ? 'runs out' : 'lowest'}: {format(marked.date, 'd MMM')}
          {forecast.absolute && <> · {marked.balance < 0 ? '−' : ''}{money(marked.balance)}</>}
          <i className="fc-key-mark" /> a scheduled charge
        </p>
      )}
    </div>
  )
}
