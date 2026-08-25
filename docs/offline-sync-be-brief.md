# Offline sync — what the backend needs to do

**For:** QuickPlan API team
**Companion to:** `docs/offline-sync.md` (the design). This is the delta: the
frontend is now built and shipped, and this is what it sends, what it expects
back, and the one change that has to land before any of it is *correct*.

---

## 1. Where things stand

The frontend queue is live. Every write goes into an IndexedDB outbox first and
is replayed from there, so mutations survive a dead connection, a killed tab and
a reboot.

It works today. It is not yet **safe**, and the gap is one header.

Right now, a request that reaches the server, succeeds, and whose response is
lost on the way back — the single most common failure on a flaky mobile network
— gets retried by the client and **creates a second row**. Add an expense in a
lift, and it can land twice.

That is item 2. Everything else in this document is smaller.

---

## 2. Required: accept `Idempotency-Key`

### 2.1 What the client sends

Every replayed mutation carries a client-generated UUID, created **once** when
the mutation is queued and **reused on every retry**:

```http
POST /api/tasks
Authorization: Bearer …
Idempotency-Key: 7c3f1a9e-4b2d-4f77-9c1a-1d0e6f8a2b34
Content-Type: application/json

{ "title": "Buy milk", "createdVia": "MANUAL" }
```

The endpoints it is sent on, exhaustively:

| Method | Path |
|---|---|
| `POST` | `/api/tasks` |
| `PATCH` | `/api/tasks/:id` |
| `DELETE` | `/api/tasks/:id` |
| `POST` | `/api/reminders` |
| `DELETE` | `/api/reminders/:id` |
| `POST` | `/api/groups/:groupId/expenses` |

The `POST`s are the ones that can duplicate and so the ones that matter. The
others are naturally idempotent, but the header is sent uniformly — please
accept it everywhere rather than allow-listing.

### 2.2 What to do with it

- **First time seen:** process normally, then store `key → (status, response
  body)` for **24 hours**, scoped to the user.
- **Same key again:** return the **stored status and body**. Do not re-execute.
- **Same key, different body:** `422`. That is a client bug and silently
  accepting it hides it.
- **No header at all:** behave exactly as today. Older clients still exist.

```
idempotency_keys
  key         text pk
  userId      uuid
  requestHash text          -- sha256 of the raw body, to catch a reused key
  status      int
  response    jsonb
  createdAt   timestamptz   -- swept after 24h
```

In NestJS this is one interceptor, applied globally. It should read the header,
look the key up, and short-circuit before the controller runs.

### 2.3 The part that will silently break it

`Idempotency-Key` is a **custom header, so the browser sends a CORS preflight
before every mutation.** If it is not in the allow-list, the `OPTIONS` fails and
**every write from the browser stops working** — not just the offline ones.

```ts
app.enableCors({
  origin: [...],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
})
```

Please verify this with an actual browser request, not curl — curl does not
preflight, so it will pass while the app is broken.

---

## 3. Required: `id` at the top level of a create response

When a create finally lands, the client swaps the temporary id it has been
showing (`tmp_…`) for the real one, and rewrites anything queued against it. It
reads:

```js
response.data.id
```

So a `POST` must respond with the created row, with `id` at the **top level** of
the body — not wrapped in `{ data: … }`, not just `{ "success": true }`. If the
id is not there, the client keeps a temporary id and the next edit to that
record 404s.

Returning the full created entity is best: the client reconciles its optimistic
row against it, which is how a queued expense picks up the server-assigned
rounding remainder on its shares.

---

## 4. The status-code contract

The client now treats your response codes as instructions. Worth knowing which
is which:

| Status | What the queue does |
|---|---|
| `2xx` | Done. Row removed, temp id adopted. |
| No response (offline, DNS, timeout) | Retry with backoff — 1s, 5s, 30s, 2m, 10m |
| `408`, `429` | Retry with backoff. Both mean "later", not "never" |
| `409` | Retry with backoff — treated as a conflict to resolve, not a refusal |
| `404` on `PATCH`/`DELETE` | **Dropped silently.** The thing is already gone; the intent is satisfied |
| Any other `4xx` | **Terminal.** Marked failed, shown to the user with your message, never retried |
| `5xx` | Retry with backoff |

Two consequences for the API:

- **Do not return `400` for anything transient.** A `400` stops the client
  permanently and surfaces an error to the user. Transient conditions need
  `429`, `503` or `408`.
- **The error message is shown verbatim.** The client reads `response.data.message`
  (string or array of strings, both handled). It is user-facing text — "title
  should not be empty" reads fine; a stack trace does not.

---

## 5. Bursts

A device coming back from a long offline stretch flushes its whole queue in one
go: sequential, one request at a time, but with no delay between them. Ten to
twenty writes in a couple of seconds from one user is normal and expected.

If there is a rate limiter, it should return `429` (which the client backs off
on) rather than `400`. Per-user limits under ~30 writes/minute will make the
recovery path visibly slow.

---

## 6. Not required yet — `updatedAt`

Phase 4 of `offline-sync.md` is conflict handling: two devices editing the same
expense while one is offline. That needs `updatedAt` returned on every entity in
every response, and `expectedUpdatedAt` accepted on `PATCH`, answering `409`
with the current server state.

**This is not blocking and does not need to be in the same release.** But if
`updatedAt` starts being returned on entities now, it costs nothing and the
conflict work later becomes frontend-only.

---

## 7. How to check it works

| Case | Expected |
|---|---|
| `POST /api/tasks` twice, same key, same body | **One** task. Second call returns the first response, same id, same status |
| Same key, different body | `422` |
| Same key, different user | Treated as new — keys are scoped per user |
| Same key 25 hours later | Treated as new; the old key has been swept |
| Browser `POST` with the header, from the deployed origin | No CORS error in the console — **check in a browser** |
| `POST /api/tasks` response body | `id` present at the top level |
| `DELETE` an already-deleted task | `404`, and the client drops it quietly |
| Validation failure | `4xx` with a human-readable `message` |

The first row is the whole point of the exercise. If it passes, offline is
correct; if it does not, offline duplicates data on a bad network, which is
worse than not having it.

---

## 8. Effort

| | |
|---|---|
| Idempotency interceptor + table + sweep | ~half a day |
| CORS allow-list | one line, easy to forget, breaks everything |
| `id` in create responses | probably already true — worth confirming |
| `updatedAt` everywhere | small, optional now |
