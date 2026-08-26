import { categoryLook } from '../../data/expenseCategories'
import type { BudgetLine } from '../../services/budgets'
import './BudgetRing.scss'

/**
 * One budget, as a ring.
 *
 * The ring is the spend against the limit; the tick inside it is where the
 * period is — a third of the way through the month, a third of the ring is
 * fair. That mark is what makes the ring readable on the 9th, when "₹2,100 of
 * ₹8,000" sounds fine and is not.
 */

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

const SIZE = 78
const STROKE = 7
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

type Props = {
  line: BudgetLine
  /** How far through the period we are, 0–1. Drawn as the pace marker. */
  pace: number
  onOpen?: (line: BudgetLine) => void
}

export function BudgetRing({ line, pace, onOpen }: Props) {
  const look = categoryLook(line.category)
  const Icon = look.icon
  // over budget still fills the ring completely rather than wrapping round
  const filled = Math.min(1, line.percentage / 100)
  const label = line.category ?? 'Everything'

  const inner = (
    <>
      <span className="ring-art">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle className="ring-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} />
          <circle
            className="ring-fill"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeDasharray={`${filled * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            // start at twelve o'clock rather than three
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
          {pace > 0 && pace < 1 && (
            <circle
              className="ring-pace"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              strokeWidth={STROKE + 5}
              strokeDasharray={`2.5 ${CIRCUMFERENCE}`}
              strokeDashoffset={-pace * CIRCUMFERENCE}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          )}
        </svg>
        <span className={`ring-glyph ${look.tone}`}><Icon size={17} /></span>
      </span>

      <strong className="ring-label">{label}</strong>
      <small className="ring-figure">{money(line.spent)} <i>of {money(line.amount)}</i></small>
    </>
  )

  const className = `budget-ring is-${line.status.toLowerCase().replace('_', '-')}`

  return onOpen
    ? <button type="button" className={className} onClick={() => onOpen(line)} title={`${label}: ${Math.round(line.percentage)}% used`}>{inner}</button>
    : <div className={className}>{inner}</div>
}
