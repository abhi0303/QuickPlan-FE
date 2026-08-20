import axios from 'axios'
import { useAppStore } from '../store/useAppStore'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'https://quickplan-u2wx.onrender.com',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const session = useAppStore.getState().session
  if (session) {
    config.headers.Authorization = `Bearer ${session.token}`
    config.headers['x-user-id'] = session.userId
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthRoute = String(error.config?.url ?? '').startsWith('/api/auth/')
    if (axios.isAxiosError(error) && error.response?.status === 401 && !isAuthRoute) {
      useAppStore.getState().signOut()
    }
    return Promise.reject(error)
  },
)

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Cannot reach the server right now. Check your connection and try again.'
    const message = (error.response.data as { message?: string | string[] } | undefined)?.message
    if (Array.isArray(message) && message.length) return message.join('. ')
    if (typeof message === 'string' && message) return message
  }
  return error instanceof Error && error.message ? error.message : fallback
}
