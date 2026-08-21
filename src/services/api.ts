import axios from 'axios'
import { useAppStore } from '../store/useAppStore'

const FALLBACK_BASE_URL = 'https://quickplan-u2wx.onrender.com'

/**
 * CI injects VITE_API_BASE_URL from a repository variable, which is an empty
 * string when that variable is unset. `??` would accept that empty string and
 * leave axios resolving every request against the page origin, so treat blank
 * as absent.
 */
const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()

export const api = axios.create({
  baseURL: configuredBaseUrl || FALLBACK_BASE_URL,
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
