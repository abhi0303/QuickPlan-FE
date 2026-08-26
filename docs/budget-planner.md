# Budget planner — what is actually left to save

**For:** QuickPlan API team + frontend
**Status:** proposal, not built
**Depends on:** `docs/budgets-and-recurring.md` (recurring expenses are its backbone)
**Related:** `docs/personal-expenses.md`, `docs/analytics-api.md`

---

## 1. Why, and what it is not

The app can now say what you spent, and a budget can say whether you are inside
a limit you set. Neither answers the question people actually open a money app
to ask:

> **I earn ₹X. After everything I already know about, how much can I save?**

That is one subtraction, and nobody can do it in their head — because the
"everything I already know about" half is scattered across a rent schedule, four
subscriptions, an EMI, and three months of groceries and dinners nobody has
added up.

**What it is:** a planner. Income in, commitments and a spending estimate out,
and the number left over. Then, and only then, where that number could be
bigger.

**What it is not:** a budget. A budget is a limit you set for a category and get
warned about. The planner is a forecast of a whole month, built mostly from
data the app already holds. They meet in one place — if a category has a
budget, the planner uses it as the estimate rather than the average, because a
limit you chose beats a habit you had.

---

## 2. Goals

1. **One number, above the fold.** "You can save ₹18,400 a month." Everything
   else on the page exists to explain or improve that number.
2. **Almost nothing to type.** Income is the only thing the app cannot know.
   Recurring expenses are exact and already stored; everything else can be
   estimated from history. A planner that demands thirty inputs gets abandoned
   on input four.
3. **Every figure is traceable.** Any number can be opened to see what it is
   made of. A forecast nobody can check is a horoscope.
4. **Suggestions are arithmetic, not advice.** "Food is 34% above your own
   three-month norm — going back to it saves ₹2,100" is checkable. "Try to eat
   out less" is not.
5. **Never suggest cutting a commitment.** Rent, EMI, loans and bills are not
   choices, and telling somebody to spend less on rent is how an app loses
   trust in one sentence.

---

## 3. How the number is built

```
monthly income
  −  committed        recurring schedules, normalised to a month
  −  estimated        everything else, from history or entered by hand
  =  what you can save
```

### 3.1 Committed — from the recurring schedules

Every active schedule, converted to a monthly figure:

| Cadence | Monthly equivalent |
|---|---|
| `DAILY` | `amount × 30.44` |
| `WEEKLY` | `amount × 4.348` |
| `MONTHLY` | `amount` |
| `YEARLY` | `amount ÷ 12` |

Rules that matter:

- **Paused schedules are excluded** but still listed, greyed, with a note. A
  paused gym membership is not a commitment this month and *is* a fact about
  next month.
- **A schedule past its `endsOn` is excluded entirely.**
- **A `GROUP` schedule counts only the user's share**, split across the current
  member count.
- Each line can be **switched off** in the plan. Somebody may know they are
  cancelling a subscription before the app does.

### 3.2 Estimated — everything else

Three ways to fill this in, in order of how little work they are:

1. **From history (default).** The per-category average of the **last three
   complete calendar months**, excluding the current partial one.
2. **Per category, by hand.** Any line can be overridden with a number the user
   types. The override sticks; the rest keep tracking history.
3. **From a budget, where one exists.** If a category has a budget, its limit is
   the estimate. A limit you chose beats a habit you had — and it keeps the two
   features from contradicting each other on the same screen.

**The rule that makes or breaks this feature:**

> The history average **must exclude expenses with `createdVia: "SYSTEM"`**.

Those are the expenses the recurring schedules created. They are already counted
in §3.1, and counting them twice would overstate rent — the largest line most
people have — by exactly 100%. This is the single most likely way for this
feature to be quietly, badly wrong.

Two more:

- **Group expenses count at the user's share**, not the total.
- **Fewer than three complete months of history** is fine: use what exists and
  say so on screen — "based on 6 weeks". Do not silently divide by three.

### 3.3 One-offs, and why they are flagged rather than dropped

A ₹38,000 laptop in July makes a three-month Shopping average of ₹14,200, which
is not what next month looks like.

Automatically discarding outliers is worse than the problem: the app would
quietly decide which of somebody's spending was real. So:

- compute the average as it is;
- **flag any category where a single expense is more than half of its
  three-month total**, naming it — *"one purchase of ₹38,000 on 12 July is most
  of this"*;
- offer one tap to exclude that expense from the estimate.

The user decides. The app shows its working.

---

## 4. Suggestions

A suggestion is only shown when it can name a number and where the number came
from.

### 4.1 What is never suggested

`Bills`, `EMI`, `Loan`, `Rent`, and anything created by a recurring schedule.
These are commitments; suggesting a cut is both useless and slightly insulting.

`Investments` is deliberately also excluded. It is money leaving the account,
but stopping a SIP is not saving money — it is the opposite of the thing the
page is for.

### 4.2 The rules

| Rule | Fires when | Says |
|---|---|---|
| **Above your own norm** | a category's last month is ≥25% over its own three-month median | "Food was ₹2,100 over your usual last month." |
| **Large share of income** | a discretionary category exceeds 15% of income | "Eating out is 18% of what you earn." |
| **Death by a thousand cuts** | ≥10 expenses in a category averaging under ₹500 | "23 orders averaging ₹240. Ten fewer is ₹2,400." |
| **Over a budget you set** | a budget exists and the average exceeds it | "You set ₹8,000 for Food and average ₹9,600." |
| **Nothing set aside** | savings figure is under 10% of income | "You are saving 4%. Trimming the two lines below gets you to 12%." |

Each carries a **rupee figure and its evidence**, and each is dismissible.
Ranking is by how much money the suggestion is worth, largest first — not by
how confident the rule is.

### 4.3 The tone rule

When the number comes out **negative**, the page does not scold. It states the
gap and shows the two or three largest movable lines. Somebody who is
overspending already knows; what they do not have is the arithmetic.

---

## 5. Backend

### 5.1 Model

```
budget_plans
  id             uuid pk
  userId         uuid fk → users
  monthlyIncome  numeric
  savingsTarget  numeric null        -- optional: "I want to save ₹20,000"
  archivedAt     timestamptz null    -- a raise archives and replaces, see below
  createdAt / updatedAt

  unique (user_id) where archived_at is null

budget_plan_items
  id             uuid pk
  planId         uuid fk → budget_plans
  source         enum RECURRING | CATEGORY
  recurringId    uuid null           -- RECURRING only
  category       text null           -- CATEGORY only
  included       boolean default true
  amountOverride numeric null        -- null means "keep tracking the live value"
  createdAt / updatedAt
```

Two decisions worth stating:

- **Items reference, they do not snapshot.** A `RECURRING` item stores the id
  and reads the schedule's current amount. When rent goes up, the plan follows.
  Only `included` and an explicit `amountOverride` are the user's own data.
  Snapshotting would make the planner quietly stale, which is the failure mode
  nobody notices.
- **A plan is archived, not edited, when income changes.** Same reasoning as
  budgets: last month's plan should keep the income that was in force. Archived
  plans are also what makes "you are saving more than you were" possible later.

### 5.2 Endpoints

```
GET    /api/planner                  the whole computed plan (below)
PUT    /api/planner                  { monthlyIncome, savingsTarget? } — creates or replaces
PATCH  /api/planner/items/:id        { included?, amountOverride? }
POST   /api/planner/recalculate      refresh estimates from history now
DELETE /api/planner                  archive it
```

`GET /api/planner` should arrive ready to render. The client does no arithmetic
— the same rule as `GET /api/budgets/status`, and for the same reason: two
places computing "what you can save" will eventually disagree, and the one on
screen will be the one that is wrong.

```json
{
  "monthlyIncome": 85000,
  "savingsTarget": 20000,
  "committed": {
    "total": 32649,
    "items": [
      { "id": "i1", "recurringId": "r1", "label": "Rent", "category": "Rent",
        "cadence": "MONTHLY", "amount": 18000, "monthly": 18000,
        "included": true, "paused": false },
      { "id": "i2", "recurringId": "r2", "label": "Netflix", "category": "Activities",
        "cadence": "MONTHLY", "amount": 649, "monthly": 649,
        "included": true, "paused": false }
    ]
  },
  "estimated": {
    "total": 28400,
    "basis": { "months": 3, "from": "2026-05-01", "to": "2026-07-31", "complete": true },
    "items": [
      { "id": "i9", "category": "Food", "monthly": 9600, "source": "AVERAGE",
        "included": true, "amountOverride": null,
        "median": 7500, "lastMonth": 9800,
        "outlier": null },
      { "id": "i10", "category": "Shopping", "monthly": 14200, "source": "AVERAGE",
        "included": true, "amountOverride": null,
        "median": 3100, "lastMonth": 38900,
        "outlier": { "expenseId": "e77", "title": "Laptop", "amount": 38000, "date": "2026-07-12" } }
    ]
  },
  "canSave": 23951,
  "savingsRate": 28.2,
  "suggestions": [
    { "id": "s1", "rule": "ABOVE_NORM", "category": "Food", "saves": 2100,
      "headline": "Food was ₹2,100 over your usual last month",
      "evidence": "₹9,600 against a three-month median of ₹7,500" }
  ]
}
```

Notes on the shape:

- **`monthly` is always present and always the monthly figure.** Cadence
  conversion happens once, server-side, so no client has to know that a weekly
  expense is ×4.348.
- **`median` and `lastMonth` travel with every estimate**, because they are what
  the "is this typical?" affordance renders, and a second round trip for them
  would be silly.
- **`outlier` is a whole expense**, not a boolean, so the UI can name it.
- **`savingsRate`** is computed server-side for the same reason the budget
  thresholds are: it drives copy and, later, notifications.

### 5.3 Privacy

`monthlyIncome` is the most sensitive field the app will hold. It must not
appear in request logs, analytics events, error reports or notification
payloads. Worth one explicit test.

---

## 6. Frontend

A new page at `/expenses/planner`, reached from a button beside **Analysis** and
**Recurring** on the Money page.

**The layout, top to bottom:**

1. **The number.** "You can save ₹23,951 a month" — with the savings rate beside
   it and, when a target exists, the distance to it. Nothing else competes for
   this space.
2. **Income.** One field, editable in place. When it is unset, the entire page is
   replaced by this one question, because nothing below it means anything yet.
3. **Committed.** The recurring lines, each with its cadence, its monthly
   equivalent, and a switch. Total at the bottom. This section is never the
   subject of a suggestion and says so quietly: *"fixed — the planner leaves
   these alone."*
4. **Estimated.** One row per category with the averaged figure, a switch, and
   an editable amount. Rows carrying an outlier show it inline with an *exclude
   it* action. A footer states the basis: *"from your last 3 complete months."*
5. **Where it could go further.** The suggestions, largest saving first, each
   with its evidence and a dismiss.

**A waterfall reads better than a pie here** — income at the left, commitments
and spending stepping down, savings standing at the right. It is the shape of
the sentence the page is making, and a pie cannot show a subtraction.

**Interaction rules:**

- Toggling any line **recomputes the headline immediately** from the numbers
  already on screen, then confirms against the server. Waiting on a round trip
  to see the effect of a switch makes the page feel broken.
- Every switch is a `PATCH`, queued through the existing outbox
  (`docs/offline-sync.md`), so the planner is usable with no connection.
- The estimate is **read-only until touched**: an override replaces the average
  only for the category it was typed into.

---

## 7. Edge cases

| Case | Behaviour |
|---|---|
| No income set | The page is one question. Nothing is computed or guessed. |
| No recurring schedules | Committed is ₹0 with a line pointing at Recurring. |
| No expense history | Estimated is empty; the page still works from income and commitments alone. |
| Under three complete months | Use what exists, state it: "based on 6 weeks". |
| Income lower than commitments | Negative savings shown plainly, with the largest movable lines. No scolding. |
| A recurring schedule is deleted | Its item disappears from the plan; nothing else changes. |
| Rent increases | The line follows automatically — items reference, not snapshot. |
| A `GROUP` recurring | Counted at the user's share of the current split. |
| Everything switched off | Savings equals income, which is correct and obviously so. |
| Currency | One currency per user, as everywhere else. |

---

## 8. Acceptance checks

| Case | Expected |
|---|---|
| Rent ₹18,000 monthly, three months of history | Rent appears **once**, in committed — never also in the average |
| Weekly ₹500 schedule | Contributes ₹2,174, not ₹500 or ₹2,000 |
| Yearly ₹12,000 insurance | Contributes ₹1,000 |
| Paused schedule | Excluded from the total, still listed as paused |
| Schedule past `endsOn` | Excluded entirely |
| One ₹38,000 purchase in a category | Average reported as-is, outlier named, one tap excludes it |
| Category with a budget of ₹8,000 | Estimate is ₹8,000, marked as coming from the budget |
| Income ₹85,000, committed ₹32,649, estimated ₹28,400 | `canSave` is ₹23,951 and `savingsRate` 28.2 |
| Every line switched off | `canSave` equals income exactly |
| Commitments exceed income | Negative figure, no scolding copy, largest movable lines shown |
| Suggestion list | Never contains Bills, EMI, Loan, Rent or Investments |
| `monthlyIncome` | Absent from logs, analytics and notification payloads |

---

## 9. Phasing

**Phase 1 — the subtraction.** Income storage, `GET /api/planner` with
committed and estimated, the page, the switches. This is the whole value: one
number that was previously impossible to work out.

**Phase 2 — the honesty features.** Outlier detection, per-category overrides,
budgets feeding estimates, the basis footer.

**Phase 3 — suggestions**, one rule at a time, cheapest first (`ABOVE_NORM`
needs nothing that phase 1 did not already compute).

**Phase 4 — targets and history.** `savingsTarget`, archived plans, and "you are
saving ₹4,000 more than in June" — which is only possible because plans are
archived rather than overwritten.

Phase 1 is worth shipping alone. A frontend-only preview is also possible before
any of this lands — `GET /api/recurring` and `GET /api/expenses?from&to` hold
everything except the income, which could sit in local state for a first look.
It should not stay that way: two devices would disagree, and the arithmetic
belongs where the notifications will eventually read it.
