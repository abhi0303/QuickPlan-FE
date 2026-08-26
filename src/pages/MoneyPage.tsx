import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Plus, Receipt, UsersRound } from 'lucide-react'
import { getApiErrorMessage } from '../services/api'
import { convertGroupToPersonal } from '../services/expenses'
import { ChevronRight, CircleAlert, Crown, Trash2, Users, Wallet } from 'lucide-react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { CreateGroupModal } from '../components/groups/CreateGroupModal'
import { PersonalLedger } from '../components/expenses/PersonalLedger'
import { useGroups } from '../hooks/useGroups'
import { useAppStore } from '../store/useAppStore'
import { avatarStyle } from '../utils/avatar'
import type { CreateGroupPayload, Group } from '../services/groups'
import './MoneyPage.scss'

/** Positive means you are owed; negative means you owe. */
function balanceLabel(net: number, currency: string) {
  const symbol = currency === 'INR' ? '₹' : ''
  const amount = `${symbol}${Math.abs(net).toFixed(2)}`
  if (Math.abs(net) < 0.01) return { text: 'Settled up', tone: 'level' as const }
  return net > 0
    ? { text: `You are owed ${amount}`, tone: 'up' as const }
    : { text: `You owe ${amount}`, tone: 'down' as const }
}


/**
 * Money, in two halves.
 *
 * **Personal** is what left your account. **Groups** is what you shared with
 * other people and still have to settle. They were one thing until the API grew
 * a scope, and holding them apart is the whole point: a coffee is not a trip.
 *
 * Which half opens first is a guess made once — someone with no groups has
 * nothing to see under Groups, and someone with groups was using them before
 * this page existed.
 */
export function MoneyPage() {
  const groups = useGroups()
  const tab = useAppStore((state) => state.moneyTab)
  const setTab = useAppStore((state) => state.setMoneyTab)
  const setComposerOpen = useAppStore((state) => state.setMoneyComposerOpen)
  const bumpExpenses = useAppStore((state) => state.bumpExpensesVersion)

  // derived, not stored in an effect: until the user picks a side, the answer
  // is whatever their groups say, and that can change while this is mounted
  const active = tab ?? (groups.loading || groups.groups.length > 0 ? 'groups' : 'personal')

  // The shell's FAB reads the tab from the store to label itself, and it cannot
  // see this derivation — so once the guess is settled, write it down. Setting
  // it makes `tab` non-null, which is what stops this running again.
  useEffect(() => {
    if (!groups.loading && tab === null) setTab(active)
  }, [groups.loading, tab, active, setTab])

  return (
    <section className="groups-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Simple finances</p>
          <h1>Money</h1>
          <p className="muted">
            {active === 'personal'
              ? 'Your own spending — no group, no split, nobody to settle with.'
              : 'Shared costs live in groups — everyone sees the same expenses and balances.'}
          </p>
        </div>
        {/* On mobile the FAB already offers this, so this button would be a
            second copy of it — it stays only while the list is empty, and is
            hidden during the load so it cannot flash in and out. */}
        <button
          className={`quick-add solid ${groups.loading || (active === 'groups' && groups.groups.length > 0) ? 'fab-covered' : ''}`}
          onClick={() => setComposerOpen(true)}
        >
          <Plus size={18} strokeWidth={2.4} /> {active === 'personal' ? 'Add expense' : 'New group'}
        </button>
      </div>

      <div className="money-tabs" role="tablist" aria-label="Money">
        <button role="tab" aria-selected={active === 'personal'}
          className={active === 'personal' ? 'is-active' : ''}
          onClick={() => setTab('personal')}>
          <Receipt size={15} /> Personal
        </button>
        <button role="tab" aria-selected={active === 'groups'}
          className={active === 'groups' ? 'is-active' : ''}
          onClick={() => setTab('groups')}>
          <UsersRound size={15} /> Groups
          {groups.groups.length > 0 && <em>{groups.groups.length}</em>}
        </button>
      </div>

      {active === 'personal'
        ? <PersonalLedger />
        : <GroupsView {...groups} onConverted={() => { groups.retry(); bumpExpenses(); setTab('personal') }} />}
    </section>
  )
}

type Props = {
  groups: Group[]
  loading: boolean
  error: string
  busyId: string
  retry: () => void
  create: (payload: CreateGroupPayload) => Promise<unknown>
  remove: (group: Group) => Promise<unknown>
  /** The group became personal expenses, so both halves of the page are stale. */
  onConverted: () => void
}

/**
 * The shared half of Money: one card per group, each showing where you stand.
 *
 * The page head, the tab switch and the loading of the groups themselves belong
 * to MoneyPage — this renders what it is handed, so both halves of the page can
 * share one fetch and one heading.
 */
export function GroupsView({ groups, loading, error, busyId, retry, create, remove, onConverted }: Props) {
  // the dialog lives in the store so the app shell's mobile FAB can open it
  const creating = useAppStore((state) => state.moneyComposerOpen)
  const setCreating = useAppStore((state) => state.setMoneyComposerOpen)
  const declined = useAppStore((state) => state.declinedConversions)
  const decline = useAppStore((state) => state.declineConversion)
  const [pendingDelete, setPendingDelete] = useState<Group | null>(null)
  const [converting, setConverting] = useState<Group | null>(null)
  const [busyConverting, setBusyConverting] = useState(false)

  /*
   * A group with one member is the workaround people invented before personal
   * expenses existed — a container for their own spending, with a pointless
   * payer, a pointless split and a balance that always says settled. Offer to
   * unpack it, once, and never mention it again if they say no.
   */
  const selfGroup = groups.find(
    (group) => group.memberCount === 1 && group.expenseCount > 0 && !declined.includes(group.id),
  )

  // leaving the page with the dialog open would otherwise reopen it on return
  useEffect(() => () => setCreating(false), [setCreating])

  const owed = groups.reduce((sum, g) => sum + Math.max(0, g.myNetBalance), 0)
  const owing = groups.reduce((sum, g) => sum + Math.max(0, -g.myNetBalance), 0)

  return (
    <>
      {selfGroup && (
        <div className="convert-offer">
          <span className="convert-icon"><Receipt size={18} /></span>
          <div>
            <strong>“{selfGroup.name}” looks like your own spending</strong>
            <p>It has one member, so there is nothing to split. Move its expenses to your personal ledger?</p>
          </div>
          <div className="convert-actions">
            <button className="text-button" onClick={() => decline(selfGroup.id)}>No thanks</button>
            <button className="quick-add solid" onClick={() => setConverting(selfGroup)}>Move them</button>
          </div>
        </div>
      )}

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
        open={converting !== null}
        busy={busyConverting}
        title="Move these to personal?"
        confirmLabel="Move them"
        busyLabel="Moving..."
        message={`The expenses in "${converting?.name ?? ''}" become your own, and the group is deleted. Getting it back means typing it all in again.`}
        onCancel={() => setConverting(null)}
        onConfirm={async () => {
          if (!converting) return
          setBusyConverting(true)
          try {
            await convertGroupToPersonal(converting.id)
            toast.success('Moved to your personal expenses')
            onConverted()
          } catch (convertError) {
            toast.error(getApiErrorMessage(convertError, 'Could not move those expenses.'))
          } finally {
            setBusyConverting(false)
            setConverting(null)
          }
        }}
      />

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
    </>
  )
}
