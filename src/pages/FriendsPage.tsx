import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleAlert, LoaderCircle, Search, Sparkles, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { useFriends } from '../hooks/useFriends'
import { useGroups } from '../hooks/useGroups'
import type { Friend } from '../services/friends'
import { avatarStyle, initials } from '../utils/avatar'
import './FriendsPage.scss'

export function FriendsPage() {
  const { friends, loading, error, busyId, retry, add, remove, query, setQuery, results, searching } = useFriends()
  const { groups } = useGroups()
  const [pendingRemove, setPendingRemove] = useState<Friend | null>(null)

  const term = query.trim()

  // How many groups you share with each friend — derived from the groups you
  // already loaded, so it costs no extra request.
  const sharedGroups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const group of groups) {
      for (const member of group.members) {
        counts.set(member.id, (counts.get(member.id) ?? 0) + 1)
      }
    }
    return counts
  }, [groups])

  return (
    <section className="friends-page">
      {/* the hero doubles as the search field, which is the page's main action */}
      <div className="friends-hero">
        <div className="hero-orbit" aria-hidden="true">
          <i /><i /><i />
        </div>

        <p className="eyebrow">Your circle</p>
        <h1>Friends</h1>
        <p className="hero-sub">Add the people you share costs with — only friends can join a group.</p>

        <label className="hero-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people by name or email..."
            aria-label="Search for people"
          />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
        </label>

        {term.length > 0 && term.length < 2 && <p className="hero-hint">Keep typing — at least two characters.</p>}

        {!loading && !error && friends.length > 0 && (
          <div className="hero-stats">
            <span><b>{friends.length}</b> friend{friends.length === 1 ? '' : 's'}</span>
            <span><b>{groups.length}</b> shared group{groups.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>

      {term.length >= 2 && (
        <div className="results-strip">
          <h2><Sparkles size={15} /> {searching ? 'Searching...' : `${results.length} match${results.length === 1 ? '' : 'es'}`}</h2>

          {!searching && results.length === 0 && (
            <p className="results-empty">Nobody registered matches “{term}”.</p>
          )}

          <div className="people-grid">
            {results.map((user) => (
              <article className="person-card is-result" key={user.id}>
                <span className="person-avatar" style={avatarStyle(user.name)}>{initials(user.name)}</span>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
                {user.isFriend ? (
                  <span className="person-added"><Check size={14} /> Already friends</span>
                ) : (
                  <button className="person-add" onClick={() => add(user)} disabled={busyId === user.id}>
                    {busyId === user.id ? <LoaderCircle size={14} className="spin" /> : <UserPlus size={14} />} Add friend
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="people-grid">
          {[0, 1, 2, 3].map((i) => <div className="person-skeleton" key={i} />)}
        </div>
      )}

      {!loading && error && (
        <div className="panel-state">
          <CircleAlert size={22} />
          <p>{error}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      )}

      {!loading && !error && friends.length === 0 && (
        <div className="friends-empty">
          <span className="empty-ring"><Users size={30} /></span>
          <p>Your circle is empty.</p>
          <small>Search above for someone already using QuickPlan.</small>
        </div>
      )}

      {!loading && !error && friends.length > 0 && (
        <div className="people-grid">
          {friends.map((friend) => {
            const shared = sharedGroups.get(friend.id) ?? 0
            return (
              <article className={`person-card ${busyId === friend.id ? 'is-busy' : ''}`} key={friend.id}>
                <span className="person-avatar" style={avatarStyle(friend.name)}>{initials(friend.name)}</span>
                <strong>{friend.name}</strong>
                <small>{friend.email}</small>

                {shared > 0 ? (
                  <Link to="/expenses" className="person-groups">
                    <Users size={12} /> {shared} shared group{shared === 1 ? '' : 's'}
                  </Link>
                ) : (
                  <span className="person-groups muted-chip"><Users size={12} /> No shared groups</span>
                )}

                <button
                  className="person-remove"
                  onClick={() => setPendingRemove(friend)}
                  disabled={busyId === friend.id}
                  aria-label={`Remove ${friend.name}`}
                >
                  <UserMinus size={15} />
                </button>
              </article>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        busy={busyId === pendingRemove?.id}
        title="Remove this friend?"
        message={`${pendingRemove?.name ?? ''} will be removed from your circle. Shared groups and recorded expenses are kept.`}
        confirmLabel="Remove"
        onCancel={() => setPendingRemove(null)}
        onConfirm={async () => {
          if (pendingRemove) await remove(pendingRemove)
          setPendingRemove(null)
        }}
      />
    </section>
  )
}
