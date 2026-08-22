import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { addFriend, listFriends, removeFriend, searchUsers } from '../services/friends'
import type { Friend } from '../services/friends'

export function useFriends() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [version, setVersion] = useState(0)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Friend[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let cancelled = false
    listFriends()
      .then((data) => { if (!cancelled) { setFriends(data); setError('') } })
      .catch((e) => { if (!cancelled) setError(getApiErrorMessage(e, 'Could not load your friends.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [version])

  // Debounced so a fast typist does not fire a request per keystroke; the API
  // also rejects anything shorter than two characters.
  useEffect(() => {
    const term = query.trim()
    // Below the API's two-character minimum there is nothing to fetch. Results
    // are hidden by deriving them below rather than clearing state here, which
    // would mean setting state during an effect.
    if (term.length < 2) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      searchUsers(term)
        .then((data) => { if (!cancelled) setResults(data) })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 300)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query])

  async function add(user: Friend) {
    setBusyId(user.id)
    try {
      await addFriend(user.id)
      setResults((current) => current.map((r) => (r.id === user.id ? { ...r, isFriend: true } : r)))
      setVersion((v) => v + 1)
      toast.success(`${user.name} added`)
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not add that friend.'))
    } finally {
      setBusyId('')
    }
  }

  async function remove(user: Friend) {
    setBusyId(user.id)
    try {
      await removeFriend(user.id)
      setVersion((v) => v + 1)
      toast.success(`${user.name} removed`)
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not remove that friend.'))
    } finally {
      setBusyId('')
    }
  }

  function retry() {
    setLoading(true)
    setError('')
    setVersion((v) => v + 1)
  }

  const term = query.trim()

  return {
    friends, loading, error, busyId, retry, add, remove,
    query, setQuery, searching,
    // stale matches stay out of view once the box is cleared
    results: term.length >= 2 ? results : [],
  }
}
