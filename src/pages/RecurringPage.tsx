import { useState } from 'react'
import { Link } from 'react-router-dom'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  ArrowLeft, CircleAlert, CircleHelp, Pause, Pencil, Play, Plus, Repeat, SkipForward, Trash2, Zap,
} from 'lucide-react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { RecurringHelp } from '../components/recurring/RecurringHelp'
import { RecurringModal } from '../components/recurring/RecurringModal'
import { categoryLook } from '../data/expenseCategories'
import { useRecurring } from '../hooks/useRecurring'
import { CADENCE_LABEL } from '../services/recurring'
import type { Recurring } from '../services/recurring'
import './RecurringPage.scss'

/**
 * The expenses that record themselves.
 *
 * The list is ordered by what is about to come out of your account, because
 * that is the only question it is really being asked. Paused schedules sink to
 * the bottom rather than disappearing — a paused rent is still a fact about
 * next month.
 */

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

/** "in 3 days" beats a date you have to subtract from today yourself. */
function nextLabel(iso: string) {
  const at = parseISO(iso)
  if (Number.isNaN(at.getTime())) return 'Not scheduled'
  const days = differenceInCalendarDays(at, new Date())
  const date = format(at, 'd MMM')
  if (days < 0) return `Due ${date}`
  if (days === 0) return `Today, ${date}`
  if (days === 1) return `Tomorrow, ${date}`
  if (days <= 14) return `In ${days} days · ${date}`
  return date
}

export function RecurringPage() {
  const { items, loading, error, busyId, retry, create, edit, pause, skip, runItNow, remove } = useRecurring()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Recurring | null>(null)
  const [pendingStop, setPendingStop] = useState<Recurring | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  const active = items.filter((item) => !item.pausedAt)
  const monthly = active
    .filter((item) => item.cadence === 'MONTHLY')
    .reduce((sum, item) => sum + item.amount, 0)

  return (
    <section className="recurring-page">
      <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>

      <div className="page-head">
        <div>
          <p className="eyebrow">Recurring</p>
          <h1>Expenses that record themselves</h1>
          <p className="muted">
            {monthly > 0
              ? `${money(monthly)} a month is already spoken for.`
              : 'Rent, an EMI, a subscription — set it once and stop typing it in.'}
          </p>
        </div>
        <div className="head-actions">
          {/* the row controls do things that cannot be guessed from a glyph —
              pausing, skipping one run, stopping for good — so the page says so */}
          <button className="head-link" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={16} /> What these do
          </button>
          <button className="quick-add solid" onClick={() => setAdding(true)}>
            <Plus size={18} strokeWidth={2.4} /> Schedule one
          </button>
        </div>
      </div>

      {loading && <div className="recurring-loading" />}

      {!loading && error && (
        <div className="panel-state">
          <CircleAlert size={22} />
          <p>{error}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="groups-empty">
          <span className="empty-wallet"><Repeat size={30} /></span>
          <p>Nothing scheduled. Rent and subscriptions are the same number every month — the app can put them in for you.</p>
          <button className="text-button" onClick={() => setAdding(true)}>Schedule your first one</button>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="recurring-list">
          {items.map((item) => {
            const look = categoryLook(item.category)
            const Icon = look.icon
            const paused = Boolean(item.pausedAt)
            return (
              <article className={`recurring-card ${paused ? 'is-paused' : ''} ${busyId === item.id ? 'is-busy' : ''}`} key={item.id}>
                <span className={`rec-icon ${look.tone}`}><Icon size={18} /></span>

                <div className="rec-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {CADENCE_LABEL[item.cadence]}
                    {item.category ? ` · ${item.category}` : ''}
                    {item.endsOn ? ` · until ${format(parseISO(item.endsOn), 'd MMM yyyy')}` : ''}
                  </small>
                </div>

                <div className="rec-figures">
                  <strong>{money(item.amount)}</strong>
                  <small className={paused ? 'is-paused' : ''}>
                    {paused ? 'Paused' : nextLabel(item.nextRunAt)}
                  </small>
                </div>

                <div className="rec-actions">
                  <button onClick={() => pause(item)}
                    aria-label={paused ? `Resume ${item.title}` : `Pause ${item.title}`}>
                    {paused ? <Play size={15} /> : <Pause size={15} />}
                    <span>{paused ? 'Resume' : 'Pause'}</span>
                  </button>
                  {!paused && (
                    <>
                      <button onClick={() => skip(item)} aria-label={`Skip the next ${item.title}`}>
                        <SkipForward size={15} />
                        <span>Skip</span>
                      </button>
                      <button onClick={() => runItNow(item)} aria-label={`Record ${item.title} now`}>
                        <Zap size={15} />
                        <span>Now</span>
                      </button>
                    </>
                  )}
                  <button onClick={() => setEditing(item)} aria-label={`Edit ${item.title}`}>
                    <Pencil size={15} />
                    <span>Edit</span>
                  </button>
                  <button className="danger" onClick={() => setPendingStop(item)} aria-label={`Stop ${item.title}`}>
                    <Trash2 size={15} />
                    <span>Stop</span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <RecurringHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      <RecurringModal
        open={adding || editing !== null}
        item={editing}
        onClose={() => { setAdding(false); setEditing(null) }}
        onSave={create}
        onEdit={async (id, patch) => {
          const target = items.find((row) => row.id === id)
          if (target) await edit(target, patch)
        }}
      />

      <ConfirmDialog
        open={pendingStop !== null}
        busy={busyId === pendingStop?.id}
        title="Stop this schedule?"
        confirmLabel="Stop it"
        busyLabel="Stopping..."
        message={`"${pendingStop?.title ?? ''}" will not be recorded again. The expenses it has already created stay where they are.`}
        onCancel={() => setPendingStop(null)}
        onConfirm={async () => {
          if (pendingStop) await remove(pendingStop)
          setPendingStop(null)
        }}
      />
    </section>
  )
}
