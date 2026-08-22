import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { createGroup, deleteGroup, listGroups } from '../services/groups'
import type { CreateGroupPayload, Group } from '../services/groups'

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    listGroups()
      .then((data) => { if (!cancelled) { setGroups(data); setError('') } })
      .catch((e) => { if (!cancelled) setError(getApiErrorMessage(e, 'Could not load your groups.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [version])

  function refresh() { setVersion((v) => v + 1) }

  function retry() {
    setLoading(true)
    setError('')
    refresh()
  }

  async function create(payload: CreateGroupPayload) {
    // POST returns members in the raw join-row shape, so refetch the list
    // rather than trusting the response to match the list payload.
    const group = await createGroup(payload)
    refresh()
    return group
  }

  async function remove(group: Group) {
    setBusyId(group.id)
    try {
      await deleteGroup(group.id)
      refresh()
      toast.success(`${group.name} deleted`)
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not delete that group.'))
    } finally {
      setBusyId('')
    }
  }

  return { groups, loading, error, busyId, retry, refresh, create, remove }
}
