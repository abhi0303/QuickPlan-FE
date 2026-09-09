import { api } from './api'
import { CURRENT_TERMS_VERSION } from '../data/legal'
import type { Session } from '../store/useAppStore'

type AuthResponse = { accessToken: string; user: { id: string; name: string; email: string } }

type RegisterResponse = {
  user: { id: string; name: string; email: string }
  emailVerified: boolean
  message: string
  /** Present only where the account is usable immediately — see `register`. */
  accessToken?: string
}

export type UserSettings = {
  inputLanguage: string
  outputLanguage: string
  notificationsEnabled: boolean
  defaultReminderOffsetMinutes: number
  defaultPriority: string
  defaultCategory: string
  currency: string
}

/**
 * Signing up has two real outcomes, and the token is not what tells them
 * apart. Where mail is configured the account is held until the address is
 * confirmed, and there is deliberately no token to read. Where it is not — a
 * local backend, mostly — the address is confirmed on the spot and a token
 * comes back, because holding an account closed pending an email that will
 * never arrive would lock it shut forever.
 *
 * So branch on `emailVerified`. Reading `accessToken` alone stores `undefined`
 * against production and drops the new user on a signed-out home screen with
 * nothing explaining why.
 */
export type RegisterResult =
  | { verified: true; session: Session; message: string }
  | { verified: false; email: string; message: string }

/** The wait the server keeps per account on both mail routes. */
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * Neither mail route says whether the address is registered, so neither
 * message may either — otherwise the screen becomes the way to find out.
 */
export const FORGOT_SENT_MESSAGE =
  'If an account exists for that address, a reset link is on its way. It expires in an hour.'
export const RESEND_SENT_MESSAGE =
  'If that address needs confirming, a new link is on its way. It expires in 24 hours.'

function toSession({ accessToken, user }: AuthResponse): Session {
  return { userId: user.id, name: user.name, email: user.email, token: accessToken }
}

export async function register(payload: { name: string; email: string; password: string }): Promise<RegisterResult> {
  /*
   * `acceptedTerms` must be the boolean, not "true" or 1 — the API rejects
   * anything it would have to coerce, because consent has to be an affirmative
   * act rather than a value that happened to be truthy. The version travels
   * with it so the record says which policies were agreed to.
   */
  const { data } = await api.post<RegisterResponse>('/api/auth/register', {
    ...payload,
    acceptedTerms: true,
    termsVersion: CURRENT_TERMS_VERSION,
  })
  if (data.emailVerified && data.accessToken) {
    return { verified: true, message: data.message, session: toSession({ accessToken: data.accessToken, user: data.user }) }
  }
  return { verified: false, email: data.user.email, message: data.message }
}

/**
 * A wrong password is a 401 as before; a right one against an unconfirmed
 * address is a 403, which the caller has to tell apart because only one of
 * them is worth offering a new confirmation link for.
 */
export async function login(payload: { email: string; password: string }): Promise<Session> {
  const { data } = await api.post<AuthResponse>('/api/auth/login', payload)
  return toSession(data)
}

/** Clicking the link twice is a success, not an error — people do it. */
export async function verifyEmail(token: string): Promise<string> {
  const { data } = await api.post<{ verified: boolean; message: string }>('/api/auth/verify-email', { token })
  return data.message
}

/**
 * These two answer the same way whether or not the address has an account, so
 * there is nothing in the response to branch on and the caller must not try.
 * A success here means the request was accepted, not that mail was sent.
 */
export async function resendVerification(email: string): Promise<void> {
  await api.post('/api/auth/resend-verification', { email })
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/api/auth/forgot-password', { email })
}

/** Succeeds into a signed-out state: every existing token is now dead. */
export async function resetPassword(payload: { token: string; password: string }): Promise<string> {
  const { data } = await api.post<{ message: string }>('/api/auth/reset-password', payload)
  return data.message
}

export type Profile = {
  id: string
  name: string
  email: string
  /** The UPI addresses people can pay you at, best one first. */
  upiIds?: string[] | null
  /** Which policies they agreed to. "legacy" for anyone who predates them. */
  termsVersion?: string | null
  termsAcceptedAt?: string | null
  settings?: UserSettings
}

/** Re-consent, for anyone whose accepted version has fallen behind. */
export async function acceptTerms(): Promise<{ termsVersion: string; termsAcceptedAt: string }> {
  const { data } = await api.post('/api/user/accept-terms', { termsVersion: CURRENT_TERMS_VERSION })
  return data as { termsVersion: string; termsAcceptedAt: string }
}

/**
 * Closing the account for good. The password is asked for because a live
 * session is not proof of ownership and this cannot be undone.
 *
 * A 200 means the token is already dead — treat it as a sign-out, not as a
 * response to act on.
 */
export async function deleteAccount(currentPassword: string): Promise<void> {
  await api.delete('/api/user/me', { data: { currentPassword } })
}

export async function fetchProfile(): Promise<Profile> {
  const { data } = await api.get('/api/user/me')
  return data
}

/**
 * Saving your own UPI addresses, so the people who owe you do not have to be
 * told one every time. Order carries meaning: the first is what the pay screen
 * offers before anybody chooses, so "make this the default" is a reorder
 * rather than a flag. An empty list clears them all.
 */
export async function saveUpiIds(upiIds: string[]): Promise<void> {
  await api.patch('/api/user/me', { upiIds })
}

/**
 * Changing the password from inside the app. The current one is asked for
 * because the session alone is not proof the person holding it is the owner.
 *
 * A wrong current password comes back as a 401, which the api interceptor
 * leaves alone on `/api/auth/` routes — mistyping it must not sign anyone out.
 *
 * On success every token issued before this moment stops working, including
 * the one that made the change, so the caller has to sign out deliberately
 * rather than wait for the next request to fail.
 */
export async function changePassword(payload: { currentPassword: string; password: string }): Promise<string> {
  const { data } = await api.patch<{ message?: string }>('/api/auth/change-password', payload)
  return data?.message || 'Your password has been changed. Please sign in again.'
}
