# Testing — starting with the parser

**For:** QuickPlan frontend + API team
**Status:** proposal, not built

---

## 1. Where things stand

There are no tests. Not a token amount — none, on either side.

That is the first thing a reviewer notices, and it is also a real risk in this
particular codebase, because several bugs shipped and were caught by eye that a
test would have caught for free:

- `applyParsed` stopped assigning the title, so every spoken task arrived with an
  empty name. Deleted in an unrelated commit, found weeks later by a user.
- `window.open(url, '_blank', 'noopener')` returns `null` **by specification**,
  so a "was the popup blocked" check navigated the page away on every click.
- A stale closure made the level-up celebration repeat every few seconds.
- Sorted pages concatenated into an unsorted list.

Every one of those is a pure function or a small unit. This is not a codebase
that needs a testing philosophy — it needs about forty tests in the right places.

**The goal is not a coverage number.** It is: the logic that is hard to see is
covered, and CI says no before a reviewer has to.

---

## 2. Stack

| | Choice | Why |
|---|---|---|
| Runner | **Vitest** | Uses the Vite config that already exists — no second build pipeline |
| DOM | **@testing-library/react** + jsdom | Queries by what the user sees |
| Network | **MSW** | Handlers instead of mocked axios, so `services/*` are exercised for real |
| E2E | **Playwright**, later and sparingly | A handful of smoke paths, not a second test suite |
| Backend | **Jest + supertest** | Already the NestJS default |

```
npm i -D vitest @vitest/coverage-v8 jsdom @testing-library/react \
         @testing-library/user-event @testing-library/jest-dom msw
```

---

## 3. Start here: the parser

`src/services/smartParser.ts` is the best test target in the project — a pure
function, one `import type`, a JSON dataset in, structured output out. It is also
the most intricate logic in the app and the least visible when it breaks.

Table-driven, because the cases are the point:

```ts
// src/services/smartParser.test.ts
import { describe, expect, it } from 'vitest'
import { parseSmartInput, mergeTranscripts } from './smartParser'
import data from '../data/smartInput.en.json'

const NOW = new Date('2026-08-25T10:00:00+05:30')
const parse = (text: string) => parseSmartInput(text, data, { now: NOW })

describe('intent and title', () => {
  it.each([
    ['remind me to call Rahul tomorrow at 5 pm', 'reminder', 'Call Rahul'],
    ['add a task to send the client proposal on Friday', 'task', 'Send the client proposal'],
    ['buy groceries', 'task', 'Buy groceries'],
    ['spent 400 on petrol', 'expense', 'Petrol'],
  ])('%s', (input, intent, title) => {
    const parsed = parse(input)
    expect(parsed?.intent).toBe(intent)
    expect(parsed?.title).toBe(title)
  })
})

describe('time', () => {
  it.each([
    ['tomorrow at 5 pm', '2026-08-26T17:00'],
    ['tomorrow at 5 am', '2026-08-26T05:00'],   // the am/pm bug
    ['at 9', '2026-08-25T21:00'],               // nearest sensible, not 9am tomorrow
    ['on 27 August 1:45 pm', '2026-08-27T13:45'],
    ['next monday', '2026-08-31T09:00'],
  ])('%s', (input, expected) => {
    expect(parse(`remind me to test ${input}`)?.dueDate).toContain(expected)
  })

  it('leaves the time out when none was said', () => {
    expect(parse('remind me to test')?.matched.time).toBeFalsy()
  })
})

describe('the title never keeps what was consumed', () => {
  it.each([
    ['remind me to call Rahul tomorrow at 5 pm', /tomorrow|5 pm/i],
    ['spent 400 rupees on petrol yesterday', /400|yesterday/i],
  ])('%s', (input, leak) => {
    expect(parse(input)?.title).not.toMatch(leak)
  })
})

describe('mergeTranscripts', () => {
  it.each([
    ['set an', 'set an alarm', 'set an alarm'],        // Android restating
    ['set an alarm', 'set an alarm', 'set an alarm'],
    ['call Rahul', 'tomorrow at 5', 'call Rahul tomorrow at 5'],
    ['', 'hello', 'hello'],
  ])('%s + %s', (a, b, expected) => {
    expect(mergeTranscripts(a, b)).toBe(expected)
  })
})
```

Roughly fifty rows covers the parser properly. Every bug found from here on
gets a row added — that is what stops it coming back.

---

## 4. Then the rest of the pure logic

In order of how much they would have saved already:

| Module | What to assert |
|---|---|
| `components/reminders/reminderTime.ts` | `nextOccurrence` for DAILY / WEEKDAYS / WEEKLY / MONTHLY, across a month end and a DST-free boundary; `formatCountdown` under a day and beyond; `alertMomentsOf` returning both lead-in and due |
| `services/exportFile.ts` | commas, quotes and newlines in a title; a title starting `=` (formula injection); the BOM; CRLF |
| `services/calendar.ts` | the Google URL for one-off and recurring; `null` without a `dueAt`; `prefersGoogleFirst` across six real user agents |
| `services/expenses.ts` | `byDateDesc` ordering and its id tie-break |
| `data/unlocks.ts` | `isUnlocked` at, below and above each threshold; `nextUnlock` at the top of the ladder |
| `services/gamification.ts` | `describeMission` matching on type **and** target — the two variants of `EXPENSE_COUNT` are exactly the trap |
| `hooks/useGroupAnalytics.ts` | the bucket builders, once extracted — week clipping to a month, empty buckets kept |

Note the last row: those builders are currently inline in the hook. **Extract
them into pure functions** and the hook gets simpler as a side effect. That is
usually the sign a test is worth writing.

---

## 5. Component tests — only where behaviour lives

Not every component. Four, where a rule would otherwise only exist in someone's
head:

1. **ExpenseModal** — an EQUAL split omits `shares` for everyone and sends them
   when someone is excluded; EXACT rejects a total that does not add up; editing
   sends amount, split type and shares together or not at all.
2. **QuickAddModal** — a spoken transcript fills the title, and submitting sends
   `createdVia: VOICE`; typing sends `MANUAL`.
3. **MultiSelect** — filtering, selection, and the flip when there is no room
   below.
4. **AddToCalendar** — hidden below level 3, and the ics route hits the
   link endpoint (MSW) rather than navigating on a failure.

Use MSW so `services/*` run for real; mocking axios would test the mock.

---

## 6. Backend

| Area | Why it earns a test |
|---|---|
| Split maths | ₹100 across 3 must return 33.34 / 33.33 / 33.33 and sum exactly. Rounding is where money bugs live |
| Balances | derived from expenses minus settlements; a partial settlement leaves the remainder |
| Permissions | member vs owner vs non-member, and **404 rather than 403** for non-members |
| Mission progress | a voice task advances a voice mission and a typed one does not; XP awarded once for a repeated event |
| Idempotency | when `docs/offline-sync.md` lands, this is its main test |
| ICS output | escaping, folding, and a stable `UID` across two exports |

---

## 7. CI

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version-file: '.nvmrc', cache: npm }
      - run: npm ci
      - run: npx tsc -b
      - run: npx eslint src
      - run: npx vitest run --coverage
      - run: npm run build
```

Two opinions about this file:

- **It runs on every push, not only on `master`.** The point is to fail before a
  human reads the diff.
- **Coverage thresholds only on the pure modules**, via
  `coverage.thresholds.perFile` over `src/services` and `src/data`. A global
  80% target encourages tests written to raise a number, which are worse than
  none.

Worth adding alongside: the **cross-component CSS check** that has been run by
hand throughout this project — it has caught four real bugs where a component
used a class defined in another component's stylesheet, which breaks only on a
cold load of one route. That belongs in CI more than most tests do.

---

## 8. Order of work

1. **Vitest wired up, and the parser suite.** Half a day, and it covers the
   riskiest code in the app.
2. **`reminderTime`, `exportFile`, `calendar`, `unlocks`.** Another half day,
   all pure.
3. **CI running typecheck, lint, tests, build, and the CSS check.**
4. **The four component tests**, once MSW is set up.
5. **Backend: split maths, balances, permissions.**
6. **Playwright smoke: sign in → add a task by voice → see it on the dashboard.**
   One path, guarding the seam that unit tests cannot.

Steps 1–3 are the ones that change how the project reads. The rest is depth.
