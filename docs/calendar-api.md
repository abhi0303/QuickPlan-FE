# Add to phone calendar — what the backend needs to build

**For:** QuickPlan API team
**From:** QuickPlan frontend
**Related:** `docs/notifications-api.md`, `docs/push-notifications.md`

---

## 1. Why this exists

A web push cannot ring. The service worker has no audio, the notification `sound`
option was removed from the spec years ago, and nothing can wake a closed PWA to
play something. On a locked phone the ceiling is: a notification, the OS
notification tone, a vibration.

Handing the reminder to the **phone's own calendar** clears that ceiling. Once
the event is in the native calendar, the operating system owns it — it fires
with QuickPlan closed, the phone locked, the app uninstalled. No push involved,
nothing to keep alive, and no cost.

This is a **copy, not a sync**: the user taps "Add to calendar" on a reminder and
the event is handed over once. Two-way sync would mean CalDAV or the Google
Calendar API with OAuth, which is a different project.

---

## 2. The one constraint that shapes the design

Generating the file in the browser and downloading it as a blob works on desktop
and Android, but **iOS in an installed PWA does not reliably open blob
downloads** — the Add-to-Calendar sheet often never appears.

What works on both platforms is a **navigation to a real HTTPS URL that returns
`Content-Type: text/calendar`**. Safari intercepts it and offers to add the
event; Android hands it to the calendar app.

But a navigation cannot carry our `Authorization: Bearer` header. **So the URL
has to authenticate itself**, which is the whole reason this needs two
endpoints rather than one.

The frontend also offers a Google Calendar option, which is a plain
`calendar.google.com/render?action=TEMPLATE&…` link built entirely client-side.
**That needs nothing from you.**

---

## 3. Endpoint one — mint a short-lived link

```
POST /api/reminders/:id/calendar-link
Authorization: Bearer <jwt>
```

```json
{
  "url": "https://quickplan-u2wx.onrender.com/api/reminders/9f2c…/calendar.ics?token=eyJhbGciOi…",
  "expiresAt": "2026-08-25T08:20:00.000Z"
}
```

- **404** if the reminder does not exist or belongs to someone else — same rule as
  the rest of the reminder endpoints.
- Suggested lifetime **5 minutes**. The client calls this and navigates
  immediately; it is never stored.
- The token should be a signed value (HMAC over `{ reminderId, userId, exp }`) so
  nothing new needs storing. A random token in a short-lived cache is equally
  fine.
- **Please do not accept the JWT itself as a query parameter.** A navigation URL
  ends up in history, referrers and access logs; a five-minute single-reminder
  token leaks almost nothing, a session token leaks everything.

---

## 4. Endpoint two — the file

```
GET /api/reminders/:id/calendar.ics?token=<signed>
```

```
200 OK
Content-Type: text/calendar; charset=utf-8
Content-Disposition: attachment; filename="dentist-appointment.ics"
Cache-Control: no-store
```

- **No `Authorization` header** — the token is the authorisation. This is a
  browser navigation, so nothing else can be attached.
- **410** (or 404) once the token has expired or if it does not match the
  reminder in the path.
- The filename can be slugged from the title; it is cosmetic.

### The file

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//QuickPlan//Reminders//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:9f2c1b7e-4d2a-4f1e-9c3a-77a1f0e5b911@quickplan.app
DTSTAMP:20260825T081500Z
DTSTART:20260827T081500Z
DTEND:20260827T083000Z
SUMMARY:Dentist appointment
DESCRIPTION:Reminder from QuickPlan
STATUS:CONFIRMED
TRANSP:TRANSPARENT
SEQUENCE:0
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Dentist appointment
TRIGGER:-PT15M
END:VALARM
END:VEVENT
END:VCALENDAR
```

### Field mapping

| Reminder | iCalendar | Notes |
|---|---|---|
| `id` | `UID` as `<id>@quickplan.app` | **Stable.** This is what makes adding the same reminder twice *update* the event instead of creating a duplicate. |
| `title` | `SUMMARY` and the `VALARM` `DESCRIPTION` | Escaped — see below. |
| `dueAt` | `DTSTART` in UTC (`…Z`) | Reminders are already stored UTC, so no `VTIMEZONE` is needed. |
| — | `DTEND` = `DTSTART` + 15 minutes | A reminder is a point in time, but several clients reject an event with neither `DTEND` nor `DURATION`. |
| `offsetMinutes` | `TRIGGER:-PT{n}M` | `TRIGGER:PT0M` when the offset is 0 — an alarm exactly at the start. |
| `recurrenceRule` | `RRULE` | See the table below. Omit entirely when there is no rule. |
| updated count | `SEQUENCE` | Increment whenever the reminder is edited, otherwise calendar clients **ignore** the update on re-import. |

### Recurrence

| `recurrenceRule` | `RRULE` |
|---|---|
| `DAILY` | `FREQ=DAILY` |
| `WEEKLY` | `FREQ=WEEKLY` |
| `MONTHLY` | `FREQ=MONTHLY` |
| `WEEKDAYS` | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| absent | no `RRULE` line |

### Formatting rules that decide whether it is accepted at all

These are the usual reasons an `.ics` silently fails to import:

- **CRLF** (`\r\n`) line endings throughout, including the last line.
- **Escaping** in `SUMMARY` and `DESCRIPTION`: `\` → `\\`, `;` → `\;`, `,` → `\,`,
  newline → `\n`. A title like "Pay rent, then call Amit" breaks the file
  otherwise, and our titles are free text.
- **Line folding** at 75 octets: continue on the next line beginning with a single
  space. Long titles, and any title with non-ASCII characters, will exceed it.
- `DTSTAMP` is required and is the moment the file was generated, not the
  reminder time.

---

## 5. Acceptance checks

Worth running these before calling it done — each one is a real client
behaviour, not a theoretical case:

| Case | Expected |
|---|---|
| `POST …/calendar-link` for own reminder | 200, url + expiresAt |
| `POST …/calendar-link` for someone else's | 404 |
| `GET …/calendar.ics?token=…` valid | 200, `text/calendar`, body parses |
| Same, after expiry | 410 or 404 |
| Token from reminder A used on reminder B | 404 |
| Title `Pay rent, then call Amit; urgent` | commas and semicolons escaped |
| Title with an emoji or Hindi text | folded correctly, still imports |
| `offsetMinutes: 0` | `TRIGGER:PT0M` |
| `recurrenceRule: WEEKDAYS` | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Import, edit the reminder, import again | one event, updated — not two |

A quick end-to-end check: open the URL on an iPhone (Add to Calendar sheet
appears) and on an Android phone (downloads, tap opens the calendar).

---

## 6. What the frontend will do

- An **Add to calendar** action on each reminder card and in the reminder editor,
  offering *Apple / other calendar* (your endpoint) and *Google Calendar* (a
  client-side link, no backend involvement).
- On iOS the `.ics` route is offered first; on Android the Google link is,
  because it is one tap instead of two.
- The link is minted and navigated to immediately — nothing is cached, so a
  five-minute token is ample.

---

## 7. Deliberately not doing (for now)

A **subscription feed** — one secret URL per user that the phone's calendar
subscribes to, so every reminder syncs automatically — is the obvious next step,
and it is a small addition to this work:

```
GET  /api/calendar/feed/:feedToken.ics    all upcoming reminders
POST /api/calendar/feed/regenerate        revoke and reissue
```

The reason it is not in this round: **Google Calendar refreshes external ICS
feeds on its own schedule, commonly 8–24 hours.** A reminder created for this
evening might appear tomorrow, which is worse than useless for reminders. iOS
refreshes subscribed calendars far more promptly (15 minutes to an hour), so the
feed is worth building if iOS is the priority — but it cannot replace the
per-reminder add on Android.
