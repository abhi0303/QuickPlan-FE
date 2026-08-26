# Recurring — every other month, and every N of anything

**For:** QuickPlan API team
**Extends:** `docs/budgets-and-recurring.md` §3 (recurring expenses, already built)
**Status:** one field, one scheduler rule, and a change to `skip-next`

---

## 1. The gap

A schedule can currently repeat daily, weekly, monthly or yearly, and that is
all. Real money does not always land on that grid:

- an insurance premium paid in August, skipped in September, paid again in
  October;
- a fortnightly cleaner;
- a quarterly maintenance charge;
- a subscription billed every six months.

Today the only way to express any of these is to let it run every month and
press **Skip** each time it is not due — which is a chore the feature exists to
remove, and which silently fails the moment somebody forgets.

---

## 2. The change: `interval`

One integer column on `recurring_expenses`:

```
interval  int  not null  default 1
```

Meaning: **every `interval` × cadence**.

| cadence | interval | reads as |
|---|---|---|
| `MONTHLY` | 1 | every month |
| `MONTHLY` | 2 | every other month |
| `MONTHLY` | 3 | quarterly |
| `MONTHLY` | 6 | twice a year |
| `WEEKLY` | 2 | fortnightly |
| `DAILY` | 2 | every other day |
| `YEARLY` | 2 | every two years |

`default 1` makes the migration additive: every existing row keeps its exact
current behaviour, and no backfill is needed.

This is deliberately the iCalendar `RRULE` `INTERVAL` rule rather than a new
invention. It is the model every calendar app already uses, it composes with
`dayOfMonth` and `weekday` unchanged, and this app already emits calendar links
for reminders — so if recurring expenses ever gain the same, the semantics
carry over with nothing to translate.

Accept it on `CreateRecurringDto` and `UpdateRecurringDto`, and return it on
every recurring row and on the planner's committed items.

---

## 3. The rule that matters: count from `startsOn`, never from the last run

`nextRunAt` must be derived from the schedule's **anchor**, not by adding an
interval to whatever ran last:

```
due(candidate)  ⟺  unitsBetween(startsOn, candidate) % interval == 0
```

…where `unitsBetween` is months, weeks, days or years to match the cadence.

Counting from the last run looks equivalent and is not. It drifts:

- **A skipped run shifts the whole series.** Skip October on an alternate-month
  schedule and last-run arithmetic moves it to November, December, February —
  the opposite months from then on.
- **A missed scheduler beat does the same thing permanently.** An outage on the
  due day silently re-phases the schedule.
- **`run-now` would re-phase it too.** Paying August's premium early on the 28th
  of July would move the whole series onto odd months.

Anchoring on `startsOn` makes all three harmless: a skip, an outage or an early
payment changes *one* occurrence and the series stays where the user put it.
This is the same discipline as `lastRunKey` — decide from a fixed origin, not
from mutable state.

**`startsOn` therefore becomes load-bearing** and should be persisted for every
schedule, defaulting to the first computed run when the client does not send
one. The frontend now offers it as "First one" on the create form.

---

## 4. What else moves

### 4.1 `POST /api/recurring/:id/skip-next`

Currently documented as "move the next run on by one cadence". With an interval
it must move on by **one interval**, not one cadence unit — skipping the August
run of an alternate-month schedule should land on October, not September, since
September was never a run at all.

### 4.2 Day-of-month clamping is unchanged

A schedule on the 31st with `interval: 2` still falls on the last day of a short
month. Clamping applies to the occurrence, not to the interval arithmetic — and
crucially, **clamping must not re-anchor the series**: February the 28th is
still "the 31st, clamped", so April is the 31st again, not the 28th.

### 4.3 Changing the interval on a running schedule

Recompute `nextRunAt` from `startsOn` under the new interval. Do not carry the
old `nextRunAt` forward — under a changed interval it may not be a valid
occurrence at all.

### 4.4 Validation

- `interval >= 1`, integer.
- An upper bound worth having: **`<= 24`**. Beyond that `YEARLY` covers it, and
  the cap stops a typo scheduling something 400 months out.
- `interval` with no `cadence` is a 400, as `cadence` is already required.

---

## 5. Acceptance checks

| Case | Expected |
|---|---|
| `MONTHLY`, `interval: 2`, `startsOn: 2026-08-05` | runs 5 Aug, 5 Oct, 5 Dec — never September |
| The same, after pressing **Skip** on the October run | next run is **December**, not November |
| The same, after **run-now** in September | the series still runs 5 Oct — one early expense, no re-phasing |
| Scheduler misses the 5 Oct beat entirely | 5 Dec is still next; the series does not shift |
| `MONTHLY`, `interval: 2`, `dayOfMonth: 31`, starting 31 Dec | 28 Feb, then **30 Apr** — clamping does not re-anchor |
| `WEEKLY`, `interval: 2`, `weekday: 1` | every other Monday |
| Existing rows after the migration | `interval = 1`, behaviour identical |
| `interval: 0` or `-1` or `2.5` | 400 |
| `interval` changed 1 → 3 on a live schedule | `nextRunAt` recomputed from `startsOn` |
| A row's response body | carries `interval`, including on `GET /api/planner` committed items |

---

## 6. Frontend, once it lands

The form gains one control under the cadence — *"Repeat every [2] months"* —
and the existing **First one** field becomes the anchor the user is choosing
when they say "starting in August".

The display side is already done and shipped: every schedule renders through a
label that reads `interval` and says *"Every other month"*, *"Every 3 months"*
and so on, falling back to the current wording when the field is absent. So the
moment the API returns `interval`, existing schedules describe themselves
correctly with no further frontend release.

**The input is deliberately not built yet.** Sending `interval` to an API that
does not accept it would fail validation and take the whole create with it —
worse than not offering the option.

---

## 7. Later, and why it costs nothing

The same field covers everything in this shape, so none of these need another
migration:

- fortnightly and every-other-day, immediately;
- "every 3 days" for a medication reminder, if reminders ever borrow the model;
- quarterly and half-yearly bills, which are just `MONTHLY` with 3 and 6.

One integer, one anchoring rule. That is the whole change.
