import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft, CircleAlert, Crown, HandCoins, LoaderCircle, Pencil, Plus, Receipt, Trash2, UserPlus, Users,
} from 'lucide-react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { ExpenseModal } from '../components/groups/ExpenseModal'
import { ManageMembersModal } from '../components/groups/ManageMembersModal'
import { useGroupDetail } from '../hooks/useGroupDetail'
import type { Expense } from '../services/expenses'
import { useAppStore } from '../store/useAppStore'
import { avatarStyle } from '../utils/avatar'
import './GroupDetailPage.scss'

const money = (value: number) => `₹${Math.abs(value).toFixed(2)}`

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

  const isOwner = group?.myRole === 'OWNER'

  // leaving the page with the dialog open would otherwise reopen it on return
  useEffect(() => () => setAdding(false), [setAdding])

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
  const mySettlements = (balances?.suggestedSettlements ?? []).filter((s) => s.fromUserId === me)

  return (
    <section className="group-detail">
      <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Money</Link>

      <div className="page-head">
        <div>
          <p className="eyebrow">{group.memberCount} member{group.memberCount === 1 ? '' : 's'}</p>
          <h1>{group.name}</h1>
          {group.description && <p className="muted">{group.description}</p>}
        </div>
        {/* the mobile FAB already offers this, so drop the duplicate once
            there is a list to look at */}
        <button
          className={`quick-add solid ${expenses.length > 0 ? 'fab-covered' : ''}`}
          onClick={() => setAdding(true)}
        >
          <Plus size={18} strokeWidth={2.4} /> Add expense
        </button>
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
                onClick={() => settle({ toUserId: suggestion.toUserId, amount: suggestion.amount })}
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
            expenses.map((expense) => {
              // author or owner may edit and delete — mirror the server rule
              const canEdit = expense.createdById === me || isOwner
              return (
                <div className={`expense-row ${busyId === expense.id ? 'is-busy' : ''}`} key={expense.id}>
                  <div className="expense-copy">
                    <strong>{expense.title}</strong>
                    <div className="expense-meta">
                      <span>{expense.iPaid ? 'You paid' : `${expense.paidBy?.name ?? 'Someone'} paid`}</span>
                      <span>{money(expense.totalAmount)}</span>
                      {expense.category && <span className="expense-cat">{expense.category}</span>}
                      <span>{format(parseISO(expense.date), 'd MMM')}</span>
                    </div>
                  </div>

                  <div className="expense-share">
                    <small>your share</small>
                    {/* rendered as returned — the server assigns the rounding remainder */}
                    <strong>{money(expense.myShare ?? 0)}</strong>
                  </div>

                  {canEdit && (
                    <div className="expense-actions">
                      <button className="expense-edit" onClick={() => setEditing(expense)}
                        aria-label={`Edit ${expense.title}`}>
                        <Pencil size={15} />
                      </button>
                      <button className="expense-delete" onClick={() => setPendingDelete(expense)}
                        aria-label={`Delete ${expense.title}`}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })
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
                <small>paid {money(member.paid)} · share {money(member.owed)}</small>
              </div>
              <span className={`balance-net ${member.net > 0.005 ? 'up' : member.net < -0.005 ? 'down' : 'level'}`}>
                {member.net > 0.005 ? `+${money(member.net)}` : member.net < -0.005 ? `−${money(member.net)}` : '—'}
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
