import { useState } from 'react'
import toast from 'react-hot-toast'
import { CircleAlert, HandCoins, LoaderCircle, X } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { createSettlement } from '../../services/expenses'
import { useAppStore } from '../../store/useAppStore'
import './PendingPaymentBar.scss'

/**
 * The question the settle dialog would have asked, for the times it is not
 * there to ask it.
 *
 * Handing off to a UPI app backgrounds the page, and backgrounding is when
 * Android reclaims memory — so coming back from GPay can mean coming back to a
 * freshly loaded app with no dialog and no memory of what was being paid. The
 * payment still happened. This asks about it wherever you land.
 *
 * Nothing here is evidence: no UPI app reports back to a web page. It is the
 * payer saying what they did, which is the same thing the dialog collects.
 */

/** After this long, asking is worse than not asking — nobody remembers. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000

const money = (value: number) => `₹${value.toFixed(2)}`

export function PendingPaymentBar() {
  const pending = useAppStore((state) => state.pendingUpiPayment)
  const dialogOpen = useAppStore((state) => state.settleDialogOpen)
  const clearUpiPayment = useAppStore((state) => state.clearUpiPayment)
  const refreshAll = useAppStore((state) => state.refreshAll)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  /* Read once, when the app started. That is exactly the moment the staleness
     of a handed-off payment matters, and reading the clock while rendering
     would make this component answer differently on every re-render. */
  const [openedAt] = useState(() => Date.now())

  if (!pending || dialogOpen) return null
  if (openedAt - new Date(pending.startedAt).getTime() > STALE_AFTER_MS) return null

  async function record() {
    if (!pending) return
    setSaving(true)
    setError('')
    try {
      await createSettlement(pending.groupId, {
        toUserId: pending.toUserId,
        amount: pending.amount,
        note: pending.note,
        settledAt: pending.startedAt,
      })
      clearUpiPayment()
      refreshAll()
      toast.success(`${money(pending.amount)} to ${pending.toName || 'them'} recorded.`)
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Could not record that. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const who = pending.toName.split(' ')[0] || 'them'

  return (
    <div className="pending-pay" role="status">
      <span className="pending-pay-mark"><HandCoins size={18} /></span>

      <div className="pending-pay-copy">
        <strong>Did {money(pending.amount)} reach {who}?</strong>
        <small>{error || 'You opened a UPI app to pay them. Nothing is recorded until you say.'}</small>
      </div>

      <div className="pending-pay-actions">
        <button className="pending-pay-yes" onClick={record} disabled={saving}>
          {saving ? <><LoaderCircle size={14} className="spin" /> Recording</> : 'Yes, record it'}
        </button>
        <button className="pending-pay-no" onClick={() => clearUpiPayment()} disabled={saving}
          aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>

      {error && <span className="pending-pay-warn"><CircleAlert size={14} /></span>}
    </div>
  )
}
