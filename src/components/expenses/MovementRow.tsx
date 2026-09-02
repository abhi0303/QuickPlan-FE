import { format, isToday, parseISO } from 'date-fns'
import { ArrowDownLeft, HandCoins, Users } from 'lucide-react'
import { categoryLook } from '../../data/expenseCategories'
import type { Movement } from '../../services/cashflow'
import './MovementRow.scss'

/**
 * One movement of money that came from a group.
 *
 * Deliberately not the expense row: a settlement received is the only inbound
 * line in Money and has to look like one, and a group expense you fronted needs
 * to say that ₹4,000 left while ₹1,000 of it was yours — otherwise the number
 * looks like a spending figure and it is not.
 */

const money = (value: number) => `₹${value.toFixed(2)}`

function whenLabel(iso: string) {
  const at = parseISO(iso)
  if (Number.isNaN(at.getTime())) return ''
  return isToday(at) ? format(at, 'h:mm a') : format(at, 'd MMM')
}

export function MovementRow({ movement }: { movement: Movement }) {
  const incoming = movement.direction === 'IN'
  const settlement = movement.kind === 'SETTLEMENT_PAID' || movement.kind === 'SETTLEMENT_RECEIVED'
  const look = categoryLook(movement.category)
  const Icon = settlement ? (incoming ? ArrowDownLeft : HandCoins) : look.icon

  const who = movement.counterparty?.name?.split(' ')[0]
  const title = settlement
    ? incoming ? `${who ?? 'Someone'} paid you` : `You paid ${who ?? 'them'}`
    : movement.title

  return (
    <div className={`movement-row ${incoming ? 'is-in' : ''}`}>
      <span className={`movement-icon ${settlement ? '' : look.tone} ${incoming ? 'is-in' : ''}`}>
        <Icon size={18} />
      </span>

      <strong className="movement-title">{title}</strong>

      <div className="movement-meta">
        {movement.groupName && <span><Users size={11} /> {movement.groupName}</span>}
        {settlement && movement.title && movement.title !== title && <span>{movement.title}</span>}
        {!settlement && movement.category && <span>{movement.category}</span>}
        <span>{whenLabel(movement.at)}</span>
      </div>

      <div className="movement-amount">
        <strong>{incoming ? '+' : '−'}{money(movement.amount)}</strong>
        {/* the number above is what moved; this is what it actually cost you */}
        {typeof movement.myShare === 'number' && movement.myShare < movement.amount && (
          <small>{money(movement.myShare)} yours</small>
        )}
      </div>
    </div>
  )
}
