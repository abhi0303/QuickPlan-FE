import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ChartPie, CircleAlert, Crown, FileDown, HandCoins, LoaderCircle, Plus,
  Receipt, UserPlus, Users,
} from 'lucide-react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { ExpenseModal } from '../components/groups/ExpenseModal'
import { ManageMembersModal } from '../components/groups/ManageMembersModal'
import { SettleModal } from '../components/groups/SettleModal'
import type { SettleSeed } from '../components/groups/SettleModal'
import { useGroupDetail } from '../hooks/useGroupDetail'
import { useUnlocked } from '../hooks/useUnlocked'
import type { Expense, MemberBalance } from '../services/expenses'
import { useAppStore } from '../store/useAppStore'
import { downloadFile, slug, toCsv } from '../services/exportFile'
import { listAllGroupExpenses } from '../services/expenses'
import { avatarStyle } from '../utils/avatar'
import { ExpenseRow } from '../components/expenses/ExpenseRow'
import './GroupDetailPage.scss'

const money = (value: number) => `₹${Math.abs(value).toFixed(2)}`

/**
 * What a member's zero balance actually means.
 *
 * A bare dash reads as "nothing here" whether the person cleared a debt or was
 * never in one. The right column stays short — the word — and the detail goes
 * on the line beneath, which is what makes sense of the row weeks later.
 */
function settledLabel(member: MemberBalance): string {
  const moved = Math.max(member.settlementsSent, member.settlementsReceived)
  if (moved > 0.005) return 'Settled'
  // owed their share and paid exactly it, so nothing ever moved between people
  if (member.owed > 0.005 || member.paid > 0.005) return 'All square'
  return '—'
}


export function GroupDetailPage() {
  const { id = '' } = useParams()
  const session = useAppStore((state) => state.session)
  const me = session?.userId ?? ''

  const {
    group, expenses, balances, loading, error, busyId,
    retry, refresh, removeExpense, settle, invite, kick, changeRole,
  } = useGroupDetail(id)
  // shared with the app shell so the mobile FAB opens this same dialog
  const adding = useAppStore((state) => state.moneyComposerOpen)
  const setAdding = useAppStore((state) => state.setMoneyComposerOpen)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [managing, setManaging] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null)
  const [settleSeed, setSettleSeed] = useState<SettleSeed | null>(null)

  const isOwner = group?.myRole === 'OWNER'

  // leaving the page with the dialog open would otherwise reopen it on return
  useEffect(() => () => setAdding(false), [setAdding])

  const [exporting, setExporting] = useState(false)
  const canExport = useUnlocked('GROUP_EXPORT')

  /**
   * Every expense in the group as one file, with a column per member holding
   * that person's share — so the split survives the export instead of only the
   * total.
   */
  async function exportGroup() {
    if (!group) return
    setExporting(true)
    try {
      const all = await listAllGroupExpenses(group.id)
      const people = group.members
      const rows: (string | number | null | undefined)[][] = [
        [group.name, group.description ?? ''],
        ['Exported', format(new Date(), 'd MMM yyyy'), format(new Date(), 'h:mm a')],
        ['Expenses', all.items.length],
        ['Total spent', all.items.reduce((sum, expense) => sum + expense.totalAmount, 0).toFixed(2)],
        [],
        // date and time apart, and the date short: a spreadsheet renders a wide
        // datetime as ##### at its default column width, which reads as missing
        ['Date', 'Time', 'Title', 'Category', 'Paid by', 'Total', ...people.map((member) => `${member.name} owes`)],
        ...all.items.map((expense) => [
          format(parseISO(expense.date), 'd MMM yyyy'),
          format(parseISO(expense.date), 'h:mm a'),
          expense.title,
          expense.category ?? '',
          expense.paidBy?.name ?? '',
          expense.totalAmount.toFixed(2),
          ...people.map((member) => {
            const share = expense.shares.find((row) => row.userId === member.id)
            return share ? share.amount.toFixed(2) : ''
          }),
        ]),
        [],
        ['Balances', ...people.map((member) => member.name)],
        ['Net', ...people.map((member) => {
          const balance = balances?.members.find((row) => row.userId === member.id)
          return balance ? balance.net.toFixed(2) : ''
        })],
      ]
      downloadFile(`${slug(group.name)}-expenses.csv`, toCsv(rows))
      toast.success(`Exported ${all.items.length} expense${all.items.length === 1 ? '' : 's'}`)
      if (all.truncated) toast('Only the most recent 2,000 are included', { icon: 'ℹ️' })
    } catch {
      toast.error('Could not build the export.')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <section className="group-detail">
        <div className="detail-skeleton" />
        <div className="detail-skeleton short" />
      </section>
    )
  }

  // Non-members receive 404, so "missing" and "not allowed" are the same state.
  if (error || !group) {
    return (
      <section className="group-detail">
        <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Money</Link>
        <div className="panel-state">
          <CircleAlert size={26} />
          <p>{error || 'This group is not available.'}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      </section>
    )
  }

  const myNet = balances?.myNetBalance ?? group.myNetBalance

  // every rupee anyone fronted — the group's own total, not the caller's share
  const groupTotal = (balances?.members ?? []).reduce((sum, member) => sum + member.paid, 0)
  const mySettlements = (balances?.suggestedSettlements ?? []).filter((s) => s.fromUserId === me)

  const canSettleAny = expenses.some(
    (expense) => !expense.iPaid && expense.paidById && (expense.myShare ?? 0) > 0.005,
  )

  /** What this group's balances say I still owe one person. */
  function owedTo(userId: string) {
    return mySettlements.find((suggestion) => suggestion.toUserId === userId)?.amount ?? 0
  }

  /*
   * Settling one expense at a time.
   *
   * A settlement is a payment between two people — the API has no concept of an
   * expense being paid off — so this prefills "pay them what my share of this
   * was" and names it in the note. The amount stays editable, because paying
   * part of what you owe is the normal case and was impossible before.
   */
  function settleExpense(expense: Expense) {
    if (!expense.paidById || expense.iPaid) return
    setSettleSeed({
      toUserId: expense.paidById,
      toName: expense.paidBy?.name ?? 'them',
      amount: expense.myShare ?? 0,
      owed: owedTo(expense.paidById),
      note: expense.title,
    })
  }

  return (
    <section className="group-detail">
      <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Money</Link>

      <div className="page-head">
        <div>
          <p className="eyebrow">{group.memberCount} member{group.memberCount === 1 ? '' : 's'}</p>
          <h1>{group.name}</h1>
          {group.description && <p className="muted">{group.description}</p>}
        </div>
        <div className="head-actions">
          {canExport && expenses.length > 0 && (
            <button className="head-link" onClick={exportGroup} disabled={exporting}>
              {exporting ? <LoaderCircle size={16} className="spin" /> : <FileDown size={16} />} Export
            </button>
          )}

          {/* worth offering as soon as there is anything to analyse */}
          {expenses.length > 0 && (
            <Link to={`/groups/${id}/analysis`} className="head-link">
              <ChartPie size={16} /> Analysis
            </Link>
          )}

          {/* the mobile FAB already offers this, so drop the duplicate once
              there is a list to look at */}
          <button
            className={`quick-add solid ${expenses.length > 0 ? 'fab-covered' : ''}`}
            onClick={() => setAdding(true)}
          >
            <Plus size={18} strokeWidth={2.4} /> Add expense
          </button>
        </div>
      </div>

      <div className={`net-banner ${myNet > 0.005 ? 'up' : myNet < -0.005 ? 'down' : 'level'}`}>
        <span className="net-icon"><HandCoins size={20} /></span>
        <div>
          <p className="net-label">Your position</p>
          <strong>
            {myNet > 0.005 ? `You are owed ${money(myNet)}`
              : myNet < -0.005 ? `You owe ${money(myNet)}`
                : 'You are settled up'}
          </strong>
        </div>

        {/* what the group has spent between everyone: the sum of what each
            member fronted, which the balances already carry */}
        <div className="net-total">
          <p className="net-label">Total spent</p>
          <strong>{money(groupTotal)}</strong>
          <small>
            {expenses.length} expense{expenses.length === 1 ? '' : 's'}
            {group.memberCount > 0 && <> · {money(groupTotal / group.memberCount)} a head</>}
          </small>
        </div>
      </div>

      {mySettlements.length > 0 && (
        <div className="panel settle-panel">
          <div className="panel-heading"><h2>Settle up</h2></div>
          <p className="muted">The fewest payments that clear your share.</p>

          {mySettlements.map((suggestion) => (
            <div className="settle-row" key={`${suggestion.toUserId}-${suggestion.amount}`}>
              <span className="friend-avatar" style={avatarStyle(suggestion.toName)}>{suggestion.toName.charAt(0).toUpperCase()}</span>
              <div className="friend-copy">
                <strong>Pay {suggestion.toName}</strong>
                <small>{money(suggestion.amount)}</small>
              </div>
              <button
                className="friend-add"
                disabled={busyId === suggestion.toUserId}
                onClick={() => setSettleSeed({
                  toUserId: suggestion.toUserId,
                  toName: suggestion.toName,
                  amount: suggestion.amount,
                  owed: suggestion.amount,
                })}
              >
                {busyId === suggestion.toUserId
                  ? <LoaderCircle size={14} className="spin" />
                  : <HandCoins size={14} />} Record
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="detail-columns">
        <div className="panel">
          <div className="panel-heading"><h2>Expenses <span className="count-pill">{expenses.length}</span></h2></div>

          {expenses.length === 0 ? (
            <div className="panel-state">
              <Receipt size={24} />
              <p>Nothing spent yet.</p>
              <button className="text-button" onClick={() => setAdding(true)}>Add the first expense</button>
            </div>
          ) : (
            <div className={`expense-list ${canSettleAny ? 'with-settle' : ''}`}>
              {expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  // author or owner may edit and delete — mirror the server rule
                  canEdit={expense.createdById === me || isOwner}
                  busy={busyId === expense.id}
                  onEdit={setEditing}
                  onDelete={setPendingDelete}
                  // only where somebody else fronted it and you owe your share
                  onSettle={!expense.iPaid && expense.paidById && (expense.myShare ?? 0) > 0.005
                    ? settleExpense
                    : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-heading"><h2>Balances</h2></div>

          {(balances?.members ?? []).map((member) => (
            <div className="balance-row" key={member.userId}>
              <span className="friend-avatar" style={avatarStyle(member.name)}>{member.name.charAt(0).toUpperCase()}</span>
              <div className="friend-copy">
                <strong>
                  {member.userId === me ? 'You' : member.name}
                  {member.role === 'OWNER' && <i className="owner-dot" title="Owner"><Crown size={11} /></i>}
                </strong>
                <small>
                  paid {money(member.paid)} · share {money(member.owed)}
                  {member.settlementsSent > 0.005 && <> · paid back {money(member.settlementsSent)}</>}
                  {member.settlementsReceived > 0.005 && <> · received {money(member.settlementsReceived)}</>}
                </small>
              </div>
              <span
                className={`balance-net ${member.net > 0.005 ? 'up' : member.net < -0.005 ? 'down' : 'level'}`}
                title={`paid ${money(member.paid)}, share ${money(member.owed)}`}
              >
                {member.net > 0.005
                  ? `+${money(member.net)}`
                  : member.net < -0.005 ? `−${money(member.net)}` : settledLabel(member)}
              </span>
            </div>
          ))}

          <div className="member-list">
            <div className="member-list-head">
              <h3><Users size={14} /> Members</h3>
              <button className="text-button" onClick={() => setManaging(true)}>
                <UserPlus size={14} /> {isOwner ? 'Add or manage' : 'View'}
              </button>
            </div>
            {group.members.map((member) => (
              <span className="member-pill" key={member.id}>
                {member.name}{member.role === 'OWNER' && <i><Crown size={10} /></i>}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ExpenseModal
        open={adding || editing !== null}
        expense={editing}
        groupId={group.id}
        members={group.members}
        currentUserId={me}
        onClose={() => { setAdding(false); setEditing(null) }}
        onSaved={refresh}
      />

      <ManageMembersModal
        open={managing}
        group={group}
        currentUserId={me}
        busyId={busyId}
        onClose={() => setManaging(false)}
        onInvite={invite}
        onRemove={async (memberId) => {
          const ok = await kick(memberId)
          // leaving means this group is gone from view, so close the dialog
          if (ok && memberId === me) setManaging(false)
          return ok
        }}
        onRole={changeRole}
      />

      <SettleModal
        seed={settleSeed}
        busy={busyId === settleSeed?.toUserId}
        onClose={() => setSettleSeed(null)}
        onConfirm={async (payload) => {
          // left open on failure, so the amount that was typed is not lost
          if (await settle(payload)) setSettleSeed(null)
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={busyId === pendingDelete?.id}
        title="Delete this expense?"
        message={`"${pendingDelete?.title ?? ''}" will be removed and everyone's balance will be recalculated.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await removeExpense(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </section>
  )
}
