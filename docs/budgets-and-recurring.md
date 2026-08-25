# Budgets and recurring expenses

**For:** QuickPlan API team + frontend
**Status:** proposal, not built
**Depends on:** `docs/personal-expenses.md` — budgets are mostly about personal
spending, so that lands first
**Related:** `docs/analytics-api.md`, `docs/notifications-api.md`

---

## 1. Why

The analysis page answers *what happened*. A budget answers *where am I now*,
which is the question that changes a decision before the money is spent. They
are different products built on the same data.

Recurring expenses are the other half of the same problem. Rent, EMI, a phone
bill and three subscriptions are perfectly predictable, and typing them in every
month is exactly the kind of chore that makes people stop using an expense
tracker in week three. They are also what makes a budget honest: a budget that
ignores ₹18,000 of rent is fiction.

---

## 2. Budgets

### 2.1 Model

```
budgets
  id           uuid  pk
  userId       uuid  fk → users
  category     text null          -- null = an overall budget for everything
  amount       numeric
  period       enum  MONTHLY | WEEKLY     -- MONTHLY covers almost every case
  scope        enum  PERSONAL | ALL       -- ALL includes your share of groups
  startsOn     date                       -- first period this applies to
  archivedAt   timestamptz null           -- kept, not deleted: see below
  createdAt / updatedAt

  unique (user_id, category, period) where archived_at is null
```

Three decisions worth stating:

- **Budgets are not deleted, they are archived.** A budget deleted in March
  should not rewrite what February looked like. Historic periods keep the limit
  that was in force.
- **`category = null` is the overall budget**, not a special row type. One
  concept, one table.
- **`scope`** exists because "₹8,000 on food" usually means *my* food, not my
  share of a group dinner in Goa. Default `PERSONAL`; let the user opt into
  `ALL`.

### 2.2 Endpoints

```
GET    /api/budgets                 the active ones
POST   /api/budgets                 { category?, amount, period?, scope?, startsOn? }
PATCH  /api/budgets/:id             amount / scope
DELETE /api/budgets/:id             archives it
GET    /api/budgets/status?period=2026-08
```

`status` is the one the UI actually renders, and it should arrive ready to draw:

```json
{
  "period": { "key": "2026-08", "from": "2026-08-01T00:00:00.000Z",
              "to": "2026-08-31T23:59:59.999Z",
              "daysElapsed": 25, "daysTotal": 31 },
  "overall": {
    "budgetId": "b0", "amount": 30000, "spent": 22400,
    "remaining": 7600, "percentage": 74.7,
    "projected": 27776, "status": "ON_TRACK"
  },
  "categories": [
    { "budgetId": "b1", "category": "Food", "amount": 8000, "spent": 6280,
      "remaining": 1720, "percentage": 78.5, "projected": 7787,
      "status": "WARNING" },
    { "budgetId": "b2", "category": "Fuel", "amount": 3000, "spent": 3480,
      "remaining": -480, "percentage": 116, "projected": 4315,
      "status": "EXCEEDED" }
  ],
  "unbudgeted": [ { "category": "Shopping", "spent": 2100 } ]
}
```

- **`projected`** is `spent ÷ daysElapsed × daysTotal`. It is the number that
  makes a budget useful on the 9th, when "₹2,100 of ₹8,000" sounds fine and is
  not. Please compute it server-side so the client cannot disagree.
- **`status`**: `ON_TRACK` under 80%, `WARNING` 80–100%, `EXCEEDED` over.
  Thresholds server-side for the same reason.
- **`unbudgeted`** shows categories with real spending and no budget — that list
  is how someone discovers the budget they should have set.

### 2.3 Notifications

Two new types for the existing feed and push (`docs/notifications-api.md`):

| Type | Fires when | Body |
|---|---|---|
| `BUDGET_WARNING` | spending crosses 80% of a budget, **once per period** | "Food is at 82% — ₹1,430 left with 9 days to go." |
| `BUDGET_EXCEEDED` | it crosses 100%, once per period | "Fuel is ₹480 over budget this month." |

**Once per period is the whole design.** A notification on every expense past
80% is how people turn notifications off. Record `lastNotifiedStatus` per budget
per period and only fire on a transition upward.

---

## 3. Recurring expenses

### 3.1 Model

```
recurring_expenses
  id            uuid  pk
  userId        uuid  fk → users
  scope         enum  PERSONAL | GROUP
  groupId       uuid null            -- GROUP only; splits equally on creation
  title         text
  amount        numeric
  category      text null
  cadence       enum  DAILY | WEEKLY | MONTHLY | YEARLY
  dayOfMonth    int null             -- MONTHLY: 1–31, see clamping below
  weekday       int null             -- WEEKLY: 0–6
  nextRunAt     timestamptz          -- the scheduler's only question
  lastRunKey    text null            -- "2026-08" / "2026-W34" — idempotency
  endsOn        date null
  pausedAt      timestamptz null
  createdAt / updatedAt

  index (next_run_at) where paused_at is null
```

**`lastRunKey` is the important field.** A scheduler that crashes mid-run, or
runs twice because two instances are alive, must not create rent twice. Writing
the period key in the same transaction as the expense makes a second attempt a
no-op — this is the same discipline as `sentLeadAt`/`sentDueAt` on reminders.

**Day-of-month clamping:** a rent set for the 31st must fall on the 28th in
February, not skip the month. Clamp to the last day.

### 3.2 Endpoints

```
GET    /api/recurring                       list, with nextRunAt
POST   /api/recurring                       create
PATCH  /api/recurring/:id                   edit, pause (pausedAt), resume
DELETE /api/recurring/:id                   stop it; created expenses stay
POST   /api/recurring/:id/skip-next         move nextRunAt on by one cadence
POST   /api/recurring/:id/run-now           create this period's expense early
```

Generated expenses carry `createdVia: "SYSTEM"` — which also keeps them out of
the voice and manual mission counts, correctly.

### 3.3 The scheduler

The reminder scheduler already exists; this is the same shape:

- Wake at least hourly. Minute precision is pointless for a monthly bill.
- For each due row: create the expense, advance `nextRunAt`, write `lastRunKey`,
  **all in one transaction**.
- Stop at `endsOn`, skip when `pausedAt` is set.
- A group recurring expense splits equally across current members at creation
  time — membership may have changed since it was set up.
- Emit `EXPENSE_ADDED` notifications for group ones, nothing for personal — a
  notification for a bill the user set up themselves is noise.

---

## 4. Frontend work

- **A budget strip on the Money page**: a ring per budgeted category, its colour
  from the category palette, `status` deciding the tone. Over-budget states are
  loud; on-track states are quiet.
- **The projection is the copy that matters** — "at this rate, ₹7,787 of ₹8,000"
  rather than only the bar. It reuses `useGroupAnalytics`-style derivation, but
  the numbers come from `status` so client and server cannot disagree.
- **Setting a budget starts from what the user already spends**: pre-fill with
  last month's total for that category. Nobody knows what their food budget
  should be; everybody recognises last month's number.
- **Recurring list** with next date and a pause switch, plus "skip this month".
- A generated expense is marked in the list — a small "auto" chip — so nobody
  wonders where it came from.

---

## 5. Acceptance checks

| Case | Expected |
|---|---|
| Two budgets for the same category and period | 409 |
| `DELETE /api/budgets/:id` | archived, and last month's status is unchanged |
| Status on the 9th, ₹2,100 of ₹8,000 spent | `projected ≈ 7233`, `ON_TRACK` |
| Spending crosses 80% twice in a period | one `BUDGET_WARNING`, not two |
| Crosses 80% then 100% | one warning, then one exceeded |
| Monthly recurring set to the 31st, February | fires on the 28th |
| Scheduler runs twice for the same period | one expense — `lastRunKey` holds |
| `skip-next` on a monthly | `nextRunAt` moves one month, nothing created |
| Group recurring, member added last week | splits across current members |
| Recurring expense `createdVia` | `SYSTEM`, and no mission counts it |

---

## 6. Phasing

**Phase 1 — budgets, monthly, personal scope.** `GET /api/budgets/status` plus
the rings. This is the daily-use payoff and it needs no scheduler.

**Phase 2 — recurring expenses.** Reuses the reminder scheduler's shape.

**Phase 3 — the notifications, weekly budgets, `scope: ALL`.**

Phase 1 is worth doing on its own. Phases 2 and 3 are what stop the budget
drifting away from reality.
