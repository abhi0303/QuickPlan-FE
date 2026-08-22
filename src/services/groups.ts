import { api } from './api'

export type GroupRole = 'OWNER' | 'MEMBER'

export type GroupMember = {
  /** The user's id — normalised, see normalizeMember. */
  id: string
  name: string
  email: string
  role: GroupRole
}

export type Group = {
  id: string
  name: string
  description?: string | null
  currency: string
  createdById: string
  myRole: GroupRole
  memberCount: number
  expenseCount: number
  members: GroupMember[]
  /** Positive: you are owed. Negative: you owe. */
  myNetBalance: number
  updatedAt?: string
}

/**
 * Members arrive in two shapes.
 *
 * GET /api/groups returns them flat as { id, name, email, role }, but POST and
 * PATCH return the raw join rows, where the person's id is `userId` and their
 * details are nested under `user`. Normalising here means the rest of the app
 * only ever sees one shape.
 */
function normalizeMember(raw: unknown): GroupMember | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const nested = (source.user ?? {}) as Record<string, unknown>

  const id = (source.userId ?? nested.id ?? source.id) as string | undefined
  const name = (nested.name ?? source.name) as string | undefined
  if (!id || !name) return null

  return {
    id,
    name,
    email: ((nested.email ?? source.email) as string | undefined) ?? '',
    role: source.role === 'OWNER' ? 'OWNER' : 'MEMBER',
  }
}

function normalizeGroup(raw: unknown): Group | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  if (typeof source.id !== 'string' || typeof source.name !== 'string') return null

  const members = Array.isArray(source.members)
    ? source.members.map(normalizeMember).filter((m): m is GroupMember => m !== null)
    : []

  return {
    id: source.id,
    name: source.name,
    description: (source.description as string | null) ?? null,
    currency: (source.currency as string) ?? 'INR',
    createdById: (source.createdById as string) ?? '',
    myRole: source.myRole === 'OWNER' ? 'OWNER' : 'MEMBER',
    memberCount: typeof source.memberCount === 'number' ? source.memberCount : members.length,
    expenseCount: typeof source.expenseCount === 'number' ? source.expenseCount : 0,
    members,
    myNetBalance: typeof source.myNetBalance === 'number' ? source.myNetBalance : 0,
    updatedAt: source.updatedAt as string | undefined,
  }
}

export async function listGroups(): Promise<Group[]> {
  const { data } = await api.get('/api/groups')
  return (Array.isArray(data) ? data : []).map(normalizeGroup).filter((g): g is Group => g !== null)
}

export async function getGroup(id: string): Promise<Group | null> {
  const { data } = await api.get(`/api/groups/${id}`)
  return normalizeGroup(data)
}

export type CreateGroupPayload = {
  name: string
  description?: string
  currency?: string
  /** Must already be your friends, or the API returns 403. */
  memberIds?: string[]
}

export async function createGroup(payload: CreateGroupPayload): Promise<Group | null> {
  const { data } = await api.post('/api/groups', payload)
  return normalizeGroup(data)
}

export async function updateGroup(id: string, patch: Partial<CreateGroupPayload>): Promise<Group | null> {
  const { data } = await api.patch(`/api/groups/${id}`, patch)
  return normalizeGroup(data)
}

export async function deleteGroup(id: string): Promise<void> {
  await api.delete(`/api/groups/${id}`)
}

export async function addMembers(groupId: string, memberIds: string[]): Promise<void> {
  await api.post(`/api/groups/${groupId}/members`, { memberIds })
}

/** Owners remove anyone; a member calling this on themselves leaves the group. */
export async function removeMember(groupId: string, memberId: string): Promise<void> {
  await api.delete(`/api/groups/${groupId}/members/${memberId}`)
}

export async function setMemberRole(groupId: string, memberId: string, role: GroupRole): Promise<void> {
  await api.patch(`/api/groups/${groupId}/members/${memberId}/role`, { role })
}
