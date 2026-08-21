import { api } from './api'

/**
 * Web Push subscription.
 *
 * Uses the W3C Push API with VAPID — no Firebase SDK. The keys a browser
 * returns (endpoint / p256dh / auth) are exactly what
 * POST /api/notifications/subscribe already expects.
 */

/**
 * Optional build-time override. Normally the key is fetched from
 * GET /api/notifications/vapid-public-key, so the frontend needs no secret at
 * build time and the server can rotate the pair without a redeploy.
 */
const ENV_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

let cachedKey: string | null = null

/** The response has no documented schema, so accept the shapes it may take. */
function readKey(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  if (payload && typeof payload === 'object') {
    const source = payload as Record<string, unknown>
    for (const field of ['publicKey', 'key', 'vapidPublicKey', 'data']) {
      const value = source[field]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return null
}

async function getVapidKey(): Promise<string | null> {
  if (ENV_VAPID_KEY) return ENV_VAPID_KEY
  if (cachedKey) return cachedKey
  try {
    const { data } = await api.get('/api/notifications/vapid-public-key')
    // the server can switch push off without removing its keys
    if (data && typeof data === 'object' && (data as { enabled?: boolean }).enabled === false) {
      return null
    }
    cachedKey = readKey(data)
    return cachedKey
  } catch {
    return null
  }
}

export type PushState =
  | 'unsupported'   // browser has no Push API
  | 'ios-needs-install' // iOS only allows push in an installed PWA
  | 'unconfigured'  // no VAPID key built in
  | 'denied'        // user blocked notifications
  | 'off'           // supported and allowed, not subscribed
  | 'on'            // subscribed

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** VAPID keys travel as base64url; the Push API wants raw bytes. */
function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const normalized = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
  } catch {
    return null
  }
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) {
    // iOS exposes none of this until the app is installed to the Home Screen
    return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const subscription = await registration?.pushManager.getSubscription()
  return subscription ? 'on' : 'off'
}

/** Ask permission, subscribe, and hand the keys to the backend. */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'

  const key = await getVapidKey()
  if (!key) return 'unconfigured'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const registration = (await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL))
    ?? (await registerServiceWorker())
  if (!registration) return 'unsupported'

  await navigator.serviceWorker.ready

  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    // required: every push must show something the user can see
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  })

  const json = subscription.toJSON()
  await api.post('/api/notifications/subscribe', {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    userAgent: navigator.userAgent,
  })

  return 'on'
}

/** Unsubscribes in the browser and drops the row on the server. */
export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const subscription = await registration?.pushManager.getSubscription()
  const endpoint = subscription?.endpoint

  await subscription?.unsubscribe()

  if (endpoint) {
    try {
      await api.delete('/api/notifications/subscribe', { data: { endpoint } })
    } catch {
      // the browser subscription is gone either way; the server prunes dead
      // endpoints when its own send returns 404/410
    }
  }
  return 'off'
}

export type TestResult = { ok: boolean; detail: string }

/**
 * Ask the server to push to this account's devices.
 *
 * Checks the local half first, because a 200 from the server only means it
 * accepted the request — it says nothing about whether this browser is
 * subscribed or allowed to display anything. Reporting "sent" on the strength
 * of the status code alone hides the common failures.
 */
export async function sendTestPush(): Promise<TestResult> {
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)

  if (!registration?.active) {
    return { ok: false, detail: 'Service worker is not active yet — reload and try again.' }
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, detail: 'Notifications are not allowed for this site.' }
  }

  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    return { ok: false, detail: 'This device is not subscribed. Turn notifications off and on again.' }
  }

  const { data } = await api.post('/api/notifications/test')

  // Surface whatever the server reports about delivery, when it reports any.
  const info = data as { sent?: number; delivered?: number; failed?: number; message?: string } | undefined
  const sent = info?.sent ?? info?.delivered
  if (typeof sent === 'number') {
    if (sent === 0) {
      return { ok: false, detail: 'The server has no active subscription for this account.' }
    }
    return { ok: true, detail: `Server pushed to ${sent} device${sent === 1 ? '' : 's'}.` }
  }
  if (info?.message) return { ok: true, detail: info.message }

  return { ok: true, detail: 'Server accepted the request.' }
}

