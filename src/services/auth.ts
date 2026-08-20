import { api } from './api'
import type { Session } from '../store/useAppStore'

type AuthResponse = { accessToken: string; user: { id: string; name: string; email: string } }

export type UserSettings = {
  inputLanguage: string
  outputLanguage: string
  notificationsEnabled: boolean
  defaultReminderOffsetMinutes: number
  defaultPriority: string
  defaultCategory: string
  currency: string
}

function toSession({ accessToken, user }: AuthResponse): Session {
  return { userId: user.id, name: user.name, email: user.email, token: accessToken }
}

export async function register(payload: { name: string; email: string; password: string }): Promise<Session> {
  const { data } = await api.post<AuthResponse>('/api/auth/register', payload)
  return toSession(data)
}

export async function login(payload: { email: string; password: string }): Promise<Session> {
  const { data } = await api.post<AuthResponse>('/api/auth/login', payload)
  return toSession(data)
}

export async function fetchProfile(): Promise<{ id: string; name: string; email: string; settings?: UserSettings }> {
  const { data } = await api.get('/api/user/me')
  return data
}
