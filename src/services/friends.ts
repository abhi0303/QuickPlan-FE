import { api } from './api'

/** A registered user. Identity is the account, so duplicate names are fine. */
export type Friend = {
  id: string
  name: string
  email: string
  /** Only present on search results — drives Add vs Added. */
  isFriend?: boolean
}

export async function searchUsers(term: string): Promise<Friend[]> {
  // the API rejects fewer than 2 characters with a 400
  if (term.trim().length < 2) return []
  const { data } = await api.get('/api/friends/search', { params: { q: term.trim() } })
  return Array.isArray(data) ? data : []
}

export async function listFriends(): Promise<Friend[]> {
  const { data } = await api.get('/api/friends')
  return Array.isArray(data) ? data : []
}

/** Instant — there is no accept step, and it writes both directions. */
export async function addFriend(userId: string): Promise<void> {
  await api.post('/api/friends', { userId })
}

export async function removeFriend(friendId: string): Promise<void> {
  await api.delete(`/api/friends/${friendId}`)
}
