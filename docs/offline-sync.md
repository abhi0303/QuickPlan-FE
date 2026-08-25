# Offline-first with a sync queue

**For:** QuickPlan frontend + API team
**Status:** proposal, not built
**Related:** `docs/push-notifications.md` (the service worker this extends)

---

## 1. Why

QuickPlan is an installed PWA with a service worker, an app shell that loads
offline, and reminders that fire on a locked phone. And every single write needs
a live connection. Add a task on the metro and it fails.

The gap matters twice over. Day to day, the moments you most want to capture a
task — walking, commuting, in a lift — are the moments the connection is worst.
And as an engineering exercise it is the most interesting problem in the
codebase: optimistic state, replay, idempotency, ordering, conflicts. Those are
the things worth being able to talk about.

**The goal:** every mutation the app makes succeeds instantly from the user's
point of view, is durable across a kill and a reboot, and reaches the server
exactly once.

---

## 2. The shape

```
component  →  mutate()  →  optimistic store update
                        →  queue row in IndexedDB (status: PENDING)
                        →  flush() if online
                              → POST/PATCH/DELETE with Idempotency-Key
                              → 2xx: mark DONE, reconcile with server response
                              → 409: conflict, ask (see §6)
                              → 5xx / offline: backoff, stay PENDING
```

Three rules that keep this honest:

1. **The queue is the source of truth for "did this happen".** Not React state,
   which dies with the tab.
2. **Every queued mutation carries an idempotency key generated on the client**,
   once, at enqueue time. A retry reuses it. This is what makes "exactly once"
   achievable over an unreliable network.
3. **Order is preserved per entity.** Create-then-edit must not arrive
   backwards. A single FIFO queue with a per-entity dependency check is enough;
   a global lock is simpler still and fast enough at this scale.

---

## 3. Frontend

### 3.1 The queue

IndexedDB, one store, written from the page (not the worker) so the app can show
its state:

```ts
type QueuedMutation = {
  id: string                    // also the Idempotency-Key
  method: 'POST' | 'PATCH' | 'DELETE'
  url: string                   // '/api/tasks', '/api/tasks/abc'
  body?: unknown
  entity: 'task' | 'reminder' | 'expense' | 'group'
  /** The optimistic id this created, so later edits can be rewritten. */
  tempId?: string
  dependsOn?: string            // queue id that must land first
  status: 'PENDING' | 'SENDING' | 'FAILED'
  attempts: number
  queuedAt: number
  lastError?: string
}
```

### 3.2 Temporary ids

An offline-created task has no server id, and the user may edit or complete it
before it syncs. Give it a client id (`tmp_<uuid>`), and when the create
succeeds, rewrite the id **in the queue and in the store** to the real one.
Anything queued against `tmp_…` is patched before it is sent.

This is the part that is easy to skip and expensive to add later. Build it in
from the start.

### 3.3 Flushing

- On `online`, on app open, after every successful mutation, and from the
  service worker's `sync` event where it exists.
- **Backoff**: 1s, 5s, 30s, 2m, 10m, capped. `attempts` is stored, so a reboot
  does not reset the pressure on a failing endpoint.
- **A 4xx that is not 409 is terminal** — a validation error will not fix itself.
  Mark `FAILED`, keep the row, and tell the user rather than retrying forever.

### 3.4 Background Sync, and where it does not exist

The Background Sync API is Chromium-only. **Safari and iOS do not have it**, and
that is where a large share of installed PWAs live.

So Background Sync is an optimisation, not the mechanism:

```js
// service worker, Chromium: flush even if the app was closed
self.addEventListener('sync', (event) => {
  if (event.tag === 'quickplan-mutations') event.waitUntil(flushQueue())
})
```

Everywhere else, the queue flushes when the app is next opened or comes back
online. The user-visible consequence is worth being honest about in the UI: work
done offline syncs **when you next open the app**, not while it is closed.

### 3.5 What the user sees

- A small **offline banner**, and pending items marked in place — a task created
  offline shows a subtle "queued" dot rather than looking identical to a saved one.
- **Settings → Sync**: how many are queued, when the last flush happened,
  anything failed, and a retry button. A queue you cannot see is a queue nobody
  trusts.
- Nothing blocks. The point is that the app never waits.

### 3.6 Reads

Writes are the hard part, but reads should degrade too: cache the last
successful `GET` for tasks, reminders, groups and gamification in IndexedDB and
render them stale-while-revalidate, with an "as of HH:MM" marker when offline.

---

## 4. Backend

Two changes. Both are small, and the first is the one that matters.

### 4.1 Accept `Idempotency-Key`

On every mutating endpoint:

```
POST /api/tasks
Idempotency-Key: 7c3f1a9e-…
```

- First time: process normally, then store `key → (status, body)` for **24
  hours**, scoped to the user.
- Replay with the same key: return the **stored response**, do not re-execute.
- Same key with a *different* body: `422`. That means a client bug, and silently
  accepting it hides the bug.

Without this, a request that succeeds server-side but whose response is lost —
the single most common failure on a flaky network — creates a duplicate on every
retry. This is the whole ballgame.

A small table is enough:

```
idempotency_keys
  key         text pk
  userId      uuid
  requestHash text          -- to detect a different body under the same key
  status      int
  response    jsonb
  createdAt   timestamptz   -- swept after 24h
```

### 4.2 Optimistic concurrency on edits

Offline plus multi-device means two people, or one person on two devices, can
edit the same expense. Today the last write wins silently.

Accept the version the client last saw:

```
PATCH /api/expenses/:id
{ "title": "Dinner", "expectedUpdatedAt": "2026-08-25T09:12:00.000Z" }
```

- Matches → apply, return the new row.
- Does not match → **409** with the current server state in the body, so the
  client can show both versions rather than guessing.

Send `updatedAt` on every entity in every response for this to work.

### 4.3 What is deliberately not needed

**No batch sync endpoint.** A `POST /api/sync` taking an array is tempting and
worse: it needs its own partial-failure semantics, its own ordering rules, and
its own error format, none of which the normal endpoints need. Replaying the
real requests with idempotency keys reuses all the validation and permission
logic that already exists.

---

## 5. Conflicts

| Situation | Resolution |
|---|---|
| Create replayed after success | Idempotency key returns the original — no duplicate |
| Edit an entity deleted elsewhere | `404` → drop the mutation, tell the user it was deleted |
| Two edits to different fields | Server wins on the field; last writer wins is acceptable here |
| Two edits to the same field | `409` → show both, let the user pick. Only place worth asking |
| Expense edited offline while its group changed | `409`, because shares may no longer be valid |
| Task completed offline, deleted on another device | `404` → drop silently; the intent is satisfied |

The principle: **resolve automatically where the intent is unambiguous, ask only
where it is not.** Two people editing the same field is the only genuine case.

---

## 6. Acceptance checks

| Case | Expected |
|---|---|
| Create a task offline | appears instantly, marked queued |
| Kill the app, reopen while offline | still there, still queued |
| Come back online | syncs, marker clears, id becomes the server's |
| Create offline, edit it, then come online | one create then one edit, in that order |
| Same request replayed with the same key | one row, second call returns the first response |
| Same key, different body | 422 |
| Server 500s three times | backoff 1s/5s/30s, no duplicates |
| Validation error offline | marked FAILED, surfaced, not retried forever |
| Two devices edit the same expense title | second gets 409 with server state |
| iOS, app closed, connection returns | syncs on next open — documented, not silent |
| Airplane mode, whole session | app fully usable; reads show "as of HH:MM" |

---

## 7. Phasing

**Phase 1 — the backend accepts `Idempotency-Key`.** Nothing else can be built
safely first, and it is a day's work.

**Phase 2 — the queue, temp ids, optimistic writes for tasks and reminders.**
The highest-value entities and the simplest shapes.

**Phase 3 — expenses**, which need the group and share validation, so conflicts
are real.

**Phase 4 — `expectedUpdatedAt` and the conflict UI, Background Sync where
available, cached reads.**

Phases 1 and 2 already deliver "I can add a task on the metro". Everything after
that is about being correct when two devices disagree.
