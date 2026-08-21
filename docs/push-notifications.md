# Push notifications

> **Status:** the backend shipped everything below on its side. This document is
> kept as the reference for how the two halves fit together.

Web Push over VAPID. Firebase is not used.

**We are using the W3C Web Push standard with VAPID. Firebase is not required.**
The existing `POST /api/notifications/subscribe` endpoint already stores exactly
the fields the browser produces, so its shape does not change.

---

## 1. Why not Firebase

Firebase Cloud Messaging for web is a wrapper around this same Web Push
standard. Using it would mean storing an FCM token instead of the
`endpoint` / `p256dh` / `auth` triple the endpoint already accepts, adding a
Google project as a dependency, and shipping ~60 KB of SDK to the client for no
additional capability. FCM earns its place when native iOS/Android apps are
added later; it is not needed for a PWA.

The `https://fcm.googleapis.com/...` in the Swagger example is not Firebase — it
is simply Chrome's push server. Safari returns `https://web.push.apple.com/...`
and Firefox returns a Mozilla URL. The server posts to whichever endpoint the
browser supplied.

---

## 2. Generate VAPID keys (once)

```bash
npx web-push generate-vapid-keys
```

Produces a keypair. Store as environment variables:

```
VAPID_PUBLIC_KEY=B...     # also given to the frontend
VAPID_PRIVATE_KEY=...     # server only, never exposed
VAPID_SUBJECT=mailto:you@example.com
```

The frontend fetches the public key at runtime from
`GET /api/notifications/vapid-public-key`, so no build-time secret is required
and the key can be rotated server-side without redeploying the frontend.
`VITE_VAPID_PUBLIC_KEY` still works as a local override if ever needed.

The keypair must stay stable: regenerating it invalidates every existing
subscription and every user must re-subscribe.

---

## 3. Storage

`POST /api/notifications/subscribe` already receives:

| field | example | notes |
|---|---|---|
| `endpoint` | `https://web.push.apple.com/...` | unique per browser install |
| `p256dh` | `BIPp...` | encryption key |
| `auth` | `8eTS...` | auth secret |

Required behaviour:

- **Store many subscriptions per user.** One row per browser/device. A user with
  a phone and a laptop has two, and both should ring.
- **Upsert on `endpoint`.** The frontend re-subscribes on every load once
  enabled; without an upsert the table will fill with duplicates and users will
  get the same alert several times.
- Keep `userId`, `createdAt`, and ideally `userAgent` for debugging.

Suggested shape:

```
push_subscriptions
  id, userId, endpoint (unique), p256dh, auth, userAgent, createdAt, lastUsedAt, failureCount
```

---

## 4. Sending a push

```js
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
)

await webpush.sendNotification(
  { endpoint, keys: { p256dh, auth } },
  JSON.stringify(payload),
)
```

### Payload contract

The service worker (`public/sw.js`) reads this JSON. Only `title` is required;
anything missing falls back to a sensible default.

```jsonc
{
  "title": "Call Rahul",              // required — the notification heading
  "body": "Due at 5:00 PM",           // second line
  "url": "./reminders",               // where clicking should land, relative to app scope
  "tag": "reminder-<id>",             // same tag replaces an existing notification
  "requireInteraction": true,         // stay on screen until dismissed
  "timestamp": 1750000000000,         // ms epoch, for correct ordering
  "data": { "reminderId": "rmd-101" } // echoed back on click, for analytics
}
```

Keep the whole payload **under 3 KB** — some push services reject larger ones.

### Handling failures — important

`web-push` throws with `statusCode`:

| code | meaning | action |
|---|---|---|
| `404`, `410` | subscription is dead (app uninstalled, permission revoked) | **delete the row** — it will never work again |
| `429` | rate limited | back off and retry |
| `413` | payload too large | shrink it |

Without the 404/410 cleanup the table grows forever with dead endpoints and
every send wastes requests on them.

---

## 5. The scheduler — the largest piece of work

Nothing on the server currently knows a reminder is due. The in-app countdown
only works because a browser tab is open and counting.

For each reminder, alerts fire at:

```
notifyAt = dueAt − (offsetMinutes × 60_000)   // the lead-in, when offsetMinutes > 0
dueAt                                          // the reminder itself
```

The frontend already alerts at **both** moments while the app is open; push
should match so behaviour is consistent.

Requirements:

- A job that wakes at least once a minute and sends for anything now due
  (BullMQ, Agenda, or a plain cron — a minute of granularity is fine).
- **Mark each moment as sent.** A restart must not resend everything, and a
  reminder must not fire on every tick after it passes. Suggested:
  `sentLeadAt`, `sentDueAt` timestamps on the reminder.
- **Respect `recurrenceRule`.** `DAILY`, `WEEKDAYS`, `WEEKLY`, `MONTHLY` need
  the next occurrence computed after each send.
- Send to **every** subscription belonging to that user.
- **Time zone:** `dueAt` is stored in UTC and the frontend sends ISO strings
  produced from the user's local time, so comparisons in UTC are correct. Do
  not apply a server-local offset.

---

## 6. Endpoints — all delivered

| endpoint | frontend usage |
|---|---|
| `GET /api/notifications/vapid-public-key` | fetched on first subscribe, then cached |
| `POST /api/notifications/subscribe` | on enabling, sends `endpoint`, `p256dh`, `auth`, `userAgent` |
| `DELETE /api/notifications/subscribe` | on disabling, sends `{ endpoint }` |
| `POST /api/notifications/test` | the **Test** button beside the toggle in Settings |
| `PATCH /api/reminders/{id}` | reminder editing, now a real in-place update |

`PATCH /api/reminders/{id}` replaced a create-then-delete workaround that
changed the reminder's id on every edit. The frontend sends only the fields
that actually changed.

---

## 7. Platform constraints worth knowing

- **iOS 16.4+ only, and only for installed PWAs.** Push does not work in a
  Safari tab; the user must add QuickPlan to the Home Screen and grant
  permission from inside the installed app. This is an OS restriction and is
  the same with or without Firebase. The frontend detects this and tells the
  user to install first.
- **`userVisibleOnly: true` is mandatory.** Every push must display a visible
  notification. Push cannot be used to silently sync data or trigger a sound.
- **Delivery is best-effort.** A device that is offline receives the push when
  it reconnects, and the push service may drop it after its TTL. Do not rely on
  push for anything that must be guaranteed.

---

## 8. What the frontend already does

- Registers `public/sw.js` at the app scope on load.
- Handles `push` (shows the notification), `notificationclick` (focuses an
  existing tab or opens a new one at `url`), and `pushsubscriptionchange`.
- Settings → **Push notifications** requests permission, subscribes with the
  VAPID public key, and POSTs `endpoint` / `p256dh` / `auth` to
  `/api/notifications/subscribe`.
- Detects and explains: unsupported browser, blocked permission, iOS not yet
  installed, and missing VAPID key.

### Still outstanding

- **The scheduler (section 5).** Nothing else blocks push. Until a server-side
  job fires at `notifyAt` and `dueAt`, no notification is ever sent — the
  in-app ringtone only works while a tab is open and counting down.
- `UpdateTaskDto` and `UpdateUserDto` still document zero properties, so the
  frontend guesses at those payloads.
- No response schemas are published, so every response is normalised
  defensively on the client.
