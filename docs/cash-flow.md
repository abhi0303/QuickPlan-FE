# Cash flow — everything that actually moved your money

**For:** QuickPlan API team + frontend
**Status:** proposal, not built
**Related:** `docs/personal-expenses.md`, `docs/budget-planner.md`

---

## 1. The gap

Money leaves the account in a group and the personal side never hears about it.

Front ₹3,600 for a dinner and ₹3,600 is gone from your bank today — but Money
shows it only as "your share, ₹900", filed under a group. Settle ₹600 with a
friend and ₹600 leaves; receive ₹600 and it arrives. None of it appears in the
personal ledger, the balance, or the forecast.

So the number the forecast opens with is wrong for anybody who uses groups, and
it is wrong in the worst direction: it thinks you have money you have already
spent.

---

## 2. The distinction this rests on

**Two different questions, and the app currently only answers the first.**

| | question | basis |
|---|---|---|
| **Spending** | what did this cost me? | my **share** |
| **Cash flow** | what left my account? | the **full amount I paid**, and every settlement |

They are not the same and neither is wrong. A ₹3,600 dinner split four ways
*costs* you ₹900 and *takes* ₹3,600 out of your account on the night. Budgets
and the analysis want the first. The balance, the planner and the forecast want
the second.

**They converge once everybody settles**, which is what makes the model safe:

```
You pay ₹3,600, split four ways
  cash:      −3,600 on the night
  settled:   +900 × 3 as each friend pays you
  net:       −900   ← exactly your share

A friend pays ₹3,600, your share ₹900
  cash:       0 on the night — nothing left your account
  settled:   −900 when you pay them
  net:       −900   ← the same answer
```

Before settlement the two views disagree, and that disagreement is the whole
point: the money is gone *now* even though the debt is owed to you.

---

## 3. What must not be built

**Do not mirror group expenses into the `expenses` table as `PERSONAL` rows.**

It is the obvious implementation and it double-counts immediately:
`GET /api/expenses` would return both the mirror and the real row,
`analytics/me?scope=ALL` would add your share *and* the full amount, and every
budget would be wrong by the size of your group activity. Deleting or editing
the group expense would then have to chase its copy.

Cash flow is a **view over data that already exists**, not new rows. Nothing is
stored; it is derived from expenses and settlements on request.

---

## 4. The model

Four kinds of movement, all derivable today:

| Kind | When | Direction | Amount |
|---|---|---|---|
| `PERSONAL_EXPENSE` | a personal expense | out | `totalAmount` |
| `GROUP_EXPENSE_PAID` | a group expense where `paidById` is me | out | `totalAmount` |
| `SETTLEMENT_PAID` | a settlement where `fromUserId` is me | out | `amount` |
| `SETTLEMENT_RECEIVED` | a settlement where `toUserId` is me | in | `amount` |

Everything else is deliberately absent:

- **A group expense somebody else paid produces no movement.** You owe a share;
  no money has left your account. It appears when you settle.
- **Your share is not a movement.** It is the spending view, and it already has
  `myShare` on the expense.
- **A group expense you paid but are not part of** still moves the full amount
  out — you fronted it, and you are owed all of it back.

---

## 5. Endpoint

```
GET /api/cashflow?from&to&limit&offset
```

One list, newest first, across every group the caller belongs to plus their
personal ledger:

```json
{
  "total": 128,
  "totals": { "out": 84250, "in": 12400, "net": -71850 },
  "items": [
    { "id": "e77", "kind": "GROUP_EXPENSE_PAID", "at": "2026-09-05T14:20:00.000Z",
      "direction": "OUT", "amount": 3600, "title": "Dinner at Toit",
      "category": "Food", "groupId": "g1", "groupName": "Goa trip",
      "myShare": 900 },

    { "id": "s12", "kind": "SETTLEMENT_RECEIVED", "at": "2026-09-06T09:00:00.000Z",
      "direction": "IN", "amount": 900, "title": "Dinner at Toit",
      "groupId": "g1", "groupName": "Goa trip",
      "counterparty": { "id": "u2", "name": "Manish Kumar" } },

    { "id": "p31", "kind": "PERSONAL_EXPENSE", "at": "2026-09-06T18:30:00.000Z",
      "direction": "OUT", "amount": 400, "title": "Petrol", "category": "Fuel" }
  ]
}
```

Notes on the shape:

- **`myShare` travels with a group expense** so one response can render both
  views — "₹3,600 left your account, ₹900 of it was yours" — without a second
  request.
- **`counterparty`** is who the settlement was with. A settlement without a name
  beside it is unreadable a month later.
- **`title` on a settlement** is its note where one exists, falling back to
  something like "Settled up with Manish".
- **`totals` covers the queried window**, computed server-side for the same
  reason budget status is: the balance and the forecast will both read it, and
  two of them working it out separately will eventually disagree.

### 5.1 Why this cannot be done client-side

Settlements and group expenses are only listable one group at a time
(`/api/groups/:id/expenses`, `/api/groups/:id/settlements`). A client would
need one request per group, per view, and could still never page a merged list
correctly. It is a join, and joins belong in the database.

---

## 6. Edge cases

| Case | Expected |
|---|---|
| Group expense you paid | one `OUT` for the full amount, `myShare` alongside |
| Group expense somebody else paid | **absent** — no money moved for you |
| Settlement you paid | `OUT` |
| Settlement you received | `IN` |
| Settlement between two other members | absent |
| Expense or settlement deleted | disappears; nothing to clean up, since nothing was stored |
| You leave a group | your past movements stay — the money still moved |
| A one-member group | behaves like personal, no double entry |
| `createdVia: SYSTEM` | included: a recurring expense really does leave the account |
| Currency | one per user, as everywhere else |

---

## 7. Acceptance checks

| Case | Expected |
|---|---|
| Pay ₹3,600, four-way split, all three settle | movements sum to **−₹900**, your share |
| Friend pays ₹3,600, you settle ₹900 | movements sum to **−₹900** — the same answer |
| Friend pays, you have not settled | **no movement at all** for you yet |
| `GET /api/expenses` after all of it | unchanged — no mirrored rows anywhere |
| `analytics/me?scope=ALL` | unchanged — still share-based, still adds up |
| A month with one ₹400 personal expense and nothing else | `net: -400` |
| Settlement with a note | note is the title; without one, "Settled up with …" |
| Expense deleted | its movement is gone on the next request |

The fourth and fifth rows are the ones to watch. If either changes, something
has been stored that should have been derived.

---

## 8. Frontend work

- **The forecast opens from the right number.** Its balance currently counts
  personal expenses only; with this it counts everything that moved.
- **The ledger shows the movements inline, on by default**, each marked with its
  group. The point of the feature is that the personal record is complete: pay
  ₹4,000 for a dinner and it belongs in your own ledger that evening, because
  that is when the money went.
- **A settlement received reads as money in**, in the app's green rather than as
  a negative expense. It is the only inbound row in Money and should look it.
  Its title names the person — "Rishi paid you", "Paid Rishi" — with the note
  underneath, because "₹1,000" beside nobody is unreadable a month later.
- **The ledger's totals therefore mean cash, not spending**, and should say so:
  *"what moved, not what it cost you"*. That is the honest label once a ₹4,000
  dinner you split four ways is sitting in the list.
- **Budgets and the analysis do not change.** They are about spending, and
  spending is still `myShare` — otherwise a dinner you fronted would eat four
  times its share of a food budget. Worth stating in the UI once: *"your share,
  not what you fronted."*

That split is the part to hold on to. The same dinner is ₹4,000 in the ledger
and ₹900 in the analysis, and both are right, because they are answers to
different questions.

---

## 9. Phasing

**Phase 1 — `GET /api/cashflow` and the forecast reading it.** That alone fixes
the number that is currently wrong, which is the reason to do any of this.

**Phase 2 — the ledger toggle and settlement rows.**

**Phase 3 — a "what you fronted" figure** in the group view: how much of your
money is currently out with other people. It falls out of the same query and is
the one number a group app never tells you.
