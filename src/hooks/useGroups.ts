import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { useAppStore } from '../store/useAppStore'
import { createGroup, deleteGroup, listGroups } from '../services/groups'
import type { CreateGroupPayload, Group } from '../services/groups'
import { useCachedList } from './useCachedList'

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([])
  const cache = useCachedList<Group[]>('groups')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [version, setVersion] = useState(0)
  // the header's refresh asks every list to fetch again
  const dataVersion = useAppStore((state) => state.dataVersion)

  useEffect(() => {
    let cancelled = false

    // last known groups render at once; the request corrects them
    cache.hydrate((cached) => { if (!cancelled) { setGroups(cached); setLoading(false) } })

    listGroups()
      .then((data) => { if (!cancelled) { setGroups(data); cache.store(data); setError('') } })
      .catch((e) => { if (!cancelled) setError(getApiErrorMessage(e, 'Could not load your groups.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, dataVersion])

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

  return { groups, loading, error, busyId, retry, refresh, create, remove, staleAt: cache.staleAt }
}
