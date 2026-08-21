/* QuickPlan service worker.
 *
 * Hand-written rather than generated: the app needs push delivery and an
 * installable shell, not a precaching strategy, and this keeps the behaviour
 * readable and dependency-free.
 *
 * Push notifications are delivered here, so this file must exist and be
 * registered before any subscription can be created.
 */

const VERSION = 'quickplan-v1'

self.addEventListener('install', () => {
  // take over straight away rather than waiting for every tab to close
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * Chrome requires a fetch handler before it will treat the app as installable.
 * Deliberately a pass-through: caching app data is a separate decision, and a
 * stale cache here would be worse than no cache.
 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})

/**
 * Payload contract — see docs/push-notifications.md. Everything is optional
 * except title, and a malformed payload still produces a usable notification
 * rather than nothing.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: event.data ? event.data.text() : 'QuickPlan' }
  }

  const title = data.title || 'QuickPlan reminder'
  const options = {
    body: data.body || '',
    icon: data.icon || './favicon.svg',
    badge: data.badge || './favicon.svg',
    tag: data.tag || 'quickplan-reminder',
    renotify: true,
    requireInteraction: data.requireInteraction ?? true,
    timestamp: data.timestamp || Date.now(),
    data: { url: data.url || './reminders', ...data.data },
    actions: data.actions || [{ action: 'open', title: 'Open' }],
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/** Focus an existing tab if one is open, otherwise start a new one. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = new URL(event.notification.data?.url || './', self.location.origin + self.registration.scope).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})

/**
 * Subscriptions can be rotated by the browser. When that happens the old
 * endpoint stops working, so the app is told to re-register on next open.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      for (const client of clients) client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' })
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// referenced so the version string survives minification and is visible in devtools
self.QUICKPLAN_SW_VERSION = VERSION
