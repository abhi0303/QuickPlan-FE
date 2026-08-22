import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CircleAlert, Crown, Plus, Trash2, Users, Wallet } from 'lucide-react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { CreateGroupModal } from '../components/groups/CreateGroupModal'
import { useGroups } from '../hooks/useGroups'
import { useAppStore } from '../store/useAppStore'
import { avatarStyle } from '../utils/avatar'
import type { Group } from '../services/groups'
import './GroupsPage.scss'

/** Positive means you are owed; negative means you owe. */
function balanceLabel(net: number, currency: string) {
  const symbol = currency === 'INR' ? '₹' : ''
  const amount = `${symbol}${Math.abs(net).toFixed(2)}`
  if (Math.abs(net) < 0.01) return { text: 'Settled up', tone: 'level' as const }
  return net > 0
    ? { text: `You are owed ${amount}`, tone: 'up' as const }
    : { text: `You owe ${amount}`, tone: 'down' as const }
}

export function GroupsPage() {
  const { groups, loading, error, busyId, retry, create, remove } = useGroups()
  // the dialog lives in the store so the app shell's mobile FAB can open it
  const creating = useAppStore((state) => state.moneyComposerOpen)
  const setCreating = useAppStore((state) => state.setMoneyComposerOpen)
  const [pendingDelete, setPendingDelete] = useState<Group | null>(null)

  // leaving the page with the dialog open would otherwise reopen it on return
  useEffect(() => () => setCreating(false), [setCreating])

  const owed = groups.reduce((sum, g) => sum + Math.max(0, g.myNetBalance), 0)
  const owing = groups.reduce((sum, g) => sum + Math.max(0, -g.myNetBalance), 0)

  return (
    <section className="groups-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Simple finances</p>
          <h1>Money</h1>
          <p className="muted">Shared costs live in groups — everyone sees the same expenses and balances.</p>
        </div>
        {/* On mobile the FAB already says "new group", so this button would be
            a second copy of it — keep it only while there is nothing to show,
            and hide it during the load so it cannot flash in and out. */}
        <button
          className={`quick-add solid ${loading || groups.length > 0 ? 'fab-covered' : ''}`}
          onClick={() => setCreating(true)}
        >
          <Plus size={18} strokeWidth={2.4} /> New group
        </button>
      </div>

      {!loading && !error && groups.length > 0 && (
        <div className="balance-summary">
          <div className="balance-card up">
            <span>You are owed</span>
            <strong>₹{owed.toFixed(2)}</strong>
          </div>
          <div className="balance-card down">
            <span>You owe</span>
            <strong>₹{owing.toFixed(2)}</strong>
          </div>
        </div>
      )}

      {loading && (
        <div className="group-grid">
          {[0, 1, 2].map((i) => <div className="group-skeleton" key={i} />)}
        </div>
      )}

      {!loading && error && (
        <div className="panel-state">
          <CircleAlert size={22} />
          <p>{error}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="groups-empty">
          <span className="empty-wallet"><Wallet size={30} /></span>
          <p>No groups yet. Create one to start splitting costs.</p>
          <button className="text-button" onClick={() => setCreating(true)}>Create a group</button>
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="group-grid">
          {groups.map((group) => {
            const balance = balanceLabel(group.myNetBalance, group.currency)
            return (
              <article className={`group-card ${busyId === group.id ? 'is-busy' : ''}`} key={group.id}>
                <Link to={`/groups/${group.id}`} className="group-main">
                  <div className="group-top">
                    <h3>{group.name}</h3>
                    {group.myRole === 'OWNER' && (
                      <span className="group-owner" title="You own this group"><Crown size={13} /> Owner</span>
                    )}
                  </div>

                  {group.description && <p className="group-desc">{group.description}</p>}

                  <p className={`group-balance ${balance.tone}`}>{balance.text}</p>

                  <div className="group-meta">
                    <span><Users size={13} /> {group.memberCount}</span>
                    <span><Wallet size={13} /> {group.expenseCount} expense{group.expenseCount === 1 ? '' : 's'}</span>
                  </div>

                  <div className="group-avatars">
                    {group.members.slice(0, 4).map((member) => (
                      <i key={member.id} title={member.name} style={avatarStyle(member.name)}>
                        {member.name.charAt(0).toUpperCase()}
                      </i>
                    ))}
                    {/* the roster can be longer than what the API sends back, so
                        count the overflow from whichever is larger */}
                    {Math.max(group.memberCount, group.members.length) > 4 && (
                      <i className="more" title={`${Math.max(group.memberCount, group.members.length) - 4} more`}>
                        +{Math.max(group.memberCount, group.members.length) - 4}
                      </i>
                    )}
                  </div>

                  <span className="group-go"><ChevronRight size={18} /></span>
                </Link>

                {/* only an owner can delete, so do not offer it otherwise */}
                {group.myRole === 'OWNER' && (
                  <button className="group-delete" onClick={() => setPendingDelete(group)}
                    aria-label={`Delete ${group.name}`}>
                    <Trash2 size={15} />
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}

      <CreateGroupModal open={creating} onClose={() => setCreating(false)} onCreate={create} />

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={busyId === pendingDelete?.id}
        title="Delete this group?"
        message={`"${pendingDelete?.name ?? ''}" will be deleted along with all of its expenses and settlements. This cannot be undone.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await remove(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </section>
  )
}
