# Notifications — what the backend needs to build

**For:** QuickPlan API team
**From:** QuickPlan frontend
**Companion doc:** `docs/push-notifications.md` (Web Push transport, already delivered apart from section 5)

---

> **Status — 23 Aug 2026.** Section 4 is **delivered**: `GET /api/notifications`,
> `PATCH /api/notifications/read`, `GET /api/notifications/unread-count` and
> `DELETE /api/notifications/{id}` are live, with response schemas published for
> all of them (the first endpoints in the API to do so) and all twelve event
> types in the enum. The frontend bell menu is built against them.
>
> Still to confirm by testing against the live API: that the events in section 5
> are actually emitted, and that the scheduler in section 7 runs. The endpoints
> existing does not prove either.

## 1. Where we are today

| Piece | Status |
|---|---|
| `GET /api/notifications/vapid-public-key` | delivered |
| `POST /api/notifications/subscribe` | delivered |
| `DELETE /api/notifications/subscribe` | delivered |
| `POST /api/notifications/test` | delivered — the only thing that ever sends a push |
| A job that sends when a reminder is due | unconfirmed — see the status note above |
| Any notification raised by an app event (friend added, added to a group, …) | unconfirmed — endpoints exist, emission untested |
| Any stored notification the app can list in the bell menu | **delivered** |

The transport works and the feed is now readable. What has not been verified
from this side is whether product events write rows and send pushes, and whether
the reminder scheduler runs — both need a test against the live API.

### Why the frontend cannot do any of this alone

- **Cross-user events are invisible to the browser.** When user A adds user B as
  a friend, B's browser is not running. Only the server knows B's push
  subscriptions and only the server can send to them.
- **Push subscriptions are per user and private.** The client never sees another
  user's `endpoint`/`p256dh`, and it must not.
- **Reminders fire when nobody is looking.** The current in-app alarm only works
  because a tab is open and counting down. A phone with the app closed gets
  nothing.

Everything below is therefore server-side. The frontend work is the bell menu,
and that is small once the feed endpoint exists.

---

## 2. The shape of it: one event, two channels

Every notification is one server-side event delivered two ways:

```
             ┌── Web Push  ──► the device, even with the app closed
app event ───┤
             └── Feed row  ──► the bell menu, readable later
```

Both must come from the same place. If push is sent without writing a row, a
user who misses the toast has no way to find out what happened; if a row is
written without a push, the phone stays silent. **One emit function, two
outputs.**

A user with no push subscription (or notifications turned off) still gets the
feed row.

---

## 3. Data model

```
notifications
  id            uuid       pk
  userId        uuid       fk → users     -- the RECIPIENT, not the actor
  type          enum       -- see the catalogue in section 5
  title         text       -- short, shown as the push title and the row heading
  body          text       -- one sentence
  url           text       -- in-app path to open, e.g. "/groups/<id>"
  actorId       uuid null  fk → users     -- who caused it, for the avatar
  groupId       uuid null  fk → groups    -- when it concerns a group
  entityId      uuid null  -- reminder / expense / settlement id, when relevant
  data          jsonb null -- anything type-specific the client may want
  readAt        timestamptz null
  createdAt     timestamptz
  pushedAt      timestamptz null -- when a push was actually sent, for debugging

  index (userId, createdAt desc)
  index (userId, readAt)   -- unread counts
```

Notes:

- `title` and `body` are **written by the server**, not the client. It keeps the
  wording identical in the push banner and the bell menu.
- `url` is an app path, not an absolute URL. The service worker resolves it
  against the app scope, so `"/groups/abc"` and `"./groups/abc"` both work;
  please send it without the origin.
- Retention: anything older than 90 days can be deleted by a nightly job. The
  client never asks for more than 50 at a time.

---

## 4. Endpoints

### 4.1 List — `GET /api/notifications`

Query: `limit` (default 20, max 50), `cursor` (opaque, from the previous page),
`status` = `all` (default) | `unread`.

```json
{
  "unreadCount": 3,
  "items": [
    {
      "id": "a1b2…",
      "type": "GROUP_MEMBER_ADDED",
      "title": "Added to Goa trip",
      "body": "Abhinav added you to Goa trip.",
      "url": "/groups/7c9e…",
      "actor": { "id": "u1", "name": "Abhinav Singh" },
      "groupId": "7c9e…",
      "entityId": null,
      "data": {},
      "readAt": null,
      "createdAt": "2026-08-23T09:14:22.000Z"
    }
  ],
  "nextCursor": "eyJjcmVhdGVkQXQiOi…"
}
```

- Newest first.
- `nextCursor` is `null` on the last page.
- `unreadCount` is the **total** unread for the user, not the count in this page.
- `actor` embedded (id + name) saves the client a lookup per row.

### 4.2 Mark read — `PATCH /api/notifications/read`

```json
{ "ids": ["a1b2…", "c3d4…"] }
```

Response: `{ "unreadCount": 1 }`. Sending `{ "all": true }` marks everything
read. Idempotent — marking an already-read notification is not an error.

### 4.3 Unread count — `GET /api/notifications/unread-count`

```json
{ "unreadCount": 3 }
```

Cheap enough for the client to poll on a timer and on window focus. If you would
rather we only used the list endpoint, say so and we will drop this one.

### 4.4 Delete — `DELETE /api/notifications/{id}` *(nice to have)*

For dismissing a single row. Not required for the first release.

### 4.5 Preferences — *(phase 2, not needed for the first release)*

`GET`/`PATCH /api/notifications/preferences`

```json
{ "friends": true, "groups": true, "expenses": true, "reminders": true }
```

Until this exists everything is on, with the global push toggle in Settings as
the only switch.

---

## 5. Event catalogue

The three you asked for are marked **P1**. The rest are the events the product
already generates where a silent outcome would surprise someone — build them in
whatever order suits you.

| # | Type | Fires when | Recipients | Title / body | `url` |
|---|---|---|---|---|---|
| 1 | `FRIEND_ADDED` **P1** | `POST /api/friends` succeeds | the person who was added | "New friend" / "Abhinav added you as a friend." | `/people` |
| 2 | `GROUP_MEMBER_ADDED` **P1** | `POST /api/groups/{id}/members`, and for `memberIds` passed to `POST /api/groups` | each member added | "Added to Goa trip" / "Abhinav added you to Goa trip." | `/groups/{id}` |
| 3 | `REMINDER_DUE` **P1** | scheduler, at `dueAt` | the reminder's owner | the reminder title / "Reminder due now." | `/reminders` |
| 4 | `REMINDER_LEAD` **P1** | scheduler, at `dueAt − offsetMinutes` (only when `offsetMinutes > 0`) | the reminder's owner | the reminder title / "Due in 15 minutes." | `/reminders` |
| 5 | `EXPENSE_ADDED` | `POST /api/groups/{id}/expenses` | every group member **except the payer and the creator** | "New expense in Goa trip" / "Abhinav added Hotel — your share is ₹3,650." | `/groups/{id}` |
| 6 | `EXPENSE_UPDATED` | `PATCH /api/expenses/{id}` **and the member's own share changed** | affected members, except the editor | "Expense updated" / "Abhinav changed Hotel — your share is now ₹3,000." | `/groups/{id}` |
| 7 | `EXPENSE_DELETED` | `DELETE /api/expenses/{id}` | members who had a share, except the deleter | "Expense removed" / "Abhinav deleted Hotel from Goa trip." | `/groups/{id}` |
| 8 | `SETTLEMENT_RECORDED` | `POST /api/groups/{id}/settlements` | the counterparty (`toUserId`) | "Payment recorded" / "Abhinav marked ₹1,200 as settled with you." | `/groups/{id}` |
| 9 | `GROUP_MEMBER_REMOVED` | `DELETE /api/groups/{id}/members/{memberId}`, when an owner removes someone else | the removed member | "Removed from Goa trip" / "Abhinav removed you from Goa trip." | `/expenses` |
| 10 | `GROUP_ROLE_CHANGED` | `PATCH …/members/{memberId}/role` | the member whose role changed | "You are now an owner of Goa trip" / "Abhinav made you an owner." | `/groups/{id}` |
| 11 | `GROUP_DELETED` | `DELETE /api/groups/{id}` | every member except the owner who deleted it | "Goa trip was deleted" / "Abhinav deleted the group and its expenses." | `/expenses` |
| 12 | `TASK_DUE` *(optional)* | scheduler, at a task's `dueDate` | the task owner | the task title / "Task due today." | `/tasks` |

### Rules that apply to all of them

1. **Never notify the actor.** The person who pressed the button already knows.
   This is the single most common bug in this kind of feature.
2. **One row per recipient.** Adding four people to a group writes four rows,
   not one shared row.
3. **Amounts are per recipient.** In events 5–8 the body quotes *that member's*
   share, not the total.
4. **Currency and rounding** follow the group's `currency` and the same rounding
   the balances endpoint already uses, so the number in the notification matches
   the number on the screen.
5. **Names**: use the actor's display name as stored. The frontend shows first
   names in some places; the server does not need to.
6. **Batching (optional, phase 2):** if the same actor adds five expenses to one
   group within a few minutes, one row saying "Abhinav added 5 expenses to Goa
   trip" is kinder than five. Only worth doing if it is cheap.

---

## 6. Push payload — must match the service worker we already ship

`public/sw.js` reads exactly this. Everything except `title` is optional, and a
malformed payload still renders something, but please send the full shape:

```json
{
  "title": "Added to Goa trip",
  "body": "Abhinav added you to Goa trip.",
  "url": "/groups/7c9e…",
  "tag": "group-7c9e",
  "requireInteraction": false,
  "timestamp": 1755939262000,
  "data": {
    "type": "GROUP_MEMBER_ADDED",
    "notificationId": "a1b2…",
    "groupId": "7c9e…"
  }
}
```

- **`tag`** collapses notifications: a second push with the same tag replaces the
  first on the device instead of stacking. Suggested tags: `reminder-{id}`,
  `group-{id}`, `friend-{actorId}`, `expense-{groupId}`.
- **`requireInteraction`** should be `true` **only for reminders** — those are
  meant to persist until acknowledged. For social events send `false`, otherwise
  the banner sits on screen until dismissed and becomes annoying.
- **`data.notificationId`** lets the app mark that row read when the user taps
  the banner. Please always include it.
- `icon`/`badge` may be omitted — the service worker defaults to the app icon.

Delivery details (retries, `404`/`410` cleanup of dead endpoints, payload size)
are already specified in `docs/push-notifications.md` sections 3–4 and are
unchanged.

---

## 7. The reminder scheduler

This is still the largest piece and it is now also what powers events 3 and 4.
The spec has not changed from `docs/push-notifications.md` section 5, in short:

- A job waking at least once a minute; a minute of granularity is fine.
- Fire at **both** `dueAt − offsetMinutes` and `dueAt`, matching what the app
  does while open.
- Record `sentLeadAt` / `sentDueAt` so a restart does not resend, and a passed
  reminder does not fire on every tick.
- Honour `recurrenceRule` (`DAILY`, `WEEKDAYS`, `WEEKLY`, `MONTHLY`) by
  computing the next occurrence after each send.
- `dueAt` is stored in UTC; compare in UTC and do not apply a server-local
  offset.
- Each firing writes a feed row **and** sends the push.

---

## 8. Things we would like fixed while you are in here

These are not blockers but they cost us defensive code on every response:

1. **Publish response schemas.** All 28 operations document a `200` with no
   body schema, so every response is normalised by hand on the client. The
   notification endpoints above are a good place to start the habit.
2. `UpdateTaskDto` and `UpdateUserDto` still document zero properties.
3. The `shares[].value` validator rejects `0` for an `EQUAL` split even though
   the docs say the value is ignored — `@ValidateIf(o => o.splitType !== 'EQUAL')`
   on that field. (Reported earlier; still open.)

---

## 9. What the frontend will build once section 4 exists

So you know where this lands:

- The bell in the header gets an unread count and opens a panel listing recent
  notifications, grouped by day, each row with the actor's avatar and a relative
  time.
- Opening the panel calls `PATCH /api/notifications/read`; tapping a row follows
  its `url`.
- The count refreshes on window focus and on a slow timer, and immediately when
  a push arrives (the service worker already messages open tabs).
- Tapping a push banner opens `url` and marks that one read via
  `data.notificationId`.

None of this needs any further API beyond section 4.

---

## 10. Suggested order

**Phase 1 — makes the feature real**
`GET /api/notifications`, `PATCH /api/notifications/read`, the emit function,
events 1–4, and the scheduler.

**Phase 2 — completes it**
Events 5–11, `unread-count`, delete, preferences, batching.

Phase 1 is what unblocks the frontend; we can ship the bell menu the day the
list endpoint is available, even with only friend and group events wired.
