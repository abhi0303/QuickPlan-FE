# Analytics — what the backend needs to publish

**For:** QuickPlan API team
**From:** QuickPlan frontend
**Related:** `docs/notifications-api.md`, `docs/push-notifications.md`

---

## 1. Status

The group analysis page (**Money → a group → Analysis**) is **shipped and
working today**. It computes every figure on the client from
`GET /api/groups/{id}/expenses` and `GET /api/groups/{id}/balances`.

Nothing is blocked. This document is about replacing that arithmetic with the
server's, because the client approach has two limits it cannot fix on its own.

### Why it should move to the server

1. **It pages the whole group to draw one chart.** A group with 800 expenses is
   8 requests before the first pixel. The client caps at 2,000 expenses and says
   so on screen when it truncates — accurate, but not good.
2. **The personal dashboard cannot be done this way at all.** "Spending across
   all your groups" would mean fetching every expense of every group the user
   belongs to. That is what `GET /api/analytics/me` is for, and it is the one
   piece the client genuinely cannot replace.

### The blocker

Both analytics endpoints already exist:

| Endpoint | Documented response |
|---|---|
| `GET /api/analytics/groups/{groupId}` | `200` with **no schema** |
| `GET /api/analytics/me` | `200` with **no schema** |

The summaries say what they contain — "spend by category, by member, and over
time" — but not the field names, so nothing can be written against them. Both
already accept `from`, `to` and `bucket` (`DAY` | `WEEK` | `MONTH`), which is
exactly the right parameter set.

**What we need is the response shape.** Either:

- **(a)** publish the schema of what they already return, and we adapt to it; or
- **(b)** adopt the shape in section 2 below, and it is a straight swap — the
  frontend already has these types.

Either is fine. (a) is less work for you; (b) is less work for us. What does not
work is an undocumented `200`.

---

## 2. The shape we already render

If you are choosing (b), this maps one-to-one onto what the page draws today.

### `GET /api/analytics/groups/{groupId}?from&to&bucket`

```json
{
  "currency": "INR",
  "range": {
    "from": "2026-05-26T00:00:00.000Z",
    "to": "2026-08-24T23:59:59.999Z",
    "bucket": "WEEK"
  },
  "totals": {
    "spent": 37188,
    "expenseCount": 6,
    "average": 6198,
    "perMember": 18594,
    "myShare": 18594,
    "myPaid": 32800
  },
  "byCategory": [
    { "category": "Travel", "amount": 25740, "share": 69.2 },
    { "category": "Stay", "amount": 7300, "share": 19.6 },
    { "category": null, "amount": 3000, "share": 8.1 }
  ],
  "byMember": [
    { "userId": "u1", "name": "Abhinav Singh", "paid": 32800, "share": 18594, "net": 14206 },
    { "userId": "u2", "name": "purvee singh", "paid": 4388, "share": 18594, "net": -14206 }
  ],
  "trend": [
    { "at": "2026-08-17T00:00:00.000Z", "amount": 9800 },
    { "at": "2026-08-24T00:00:00.000Z", "amount": 25000 }
  ],
  "topExpenses": [
    {
      "id": "e1", "title": "Flight", "amount": 25000, "category": "Travel",
      "date": "2026-08-23T00:00:00.000Z",
      "paidBy": { "id": "u1", "name": "Abhinav Singh" }
    }
  ]
}
```

Details that matter:

- **`share`** is a percentage of `totals.spent`, so the client does not
  re-derive it and risk disagreeing with the pie it sits next to.
- **`net`** is `paid − share`, positive when the group owes that member. Same
  sign convention as `/balances`, please.
- **`byCategory[].category` is nullable** for uncategorised expenses. Send
  `null`, not `"Other"` — "Other" is a real category a user can pick, and
  merging the two would be wrong.
- **`trend[].at`** is the **start of each bucket** in UTC, and buckets with no
  spending may be omitted; the client draws what it is given.
- **`topExpenses`** — five is plenty.
- **Empty window**: return the envelope with zeroed totals and empty arrays, not
  `404`.
- **Amounts** in the group's own `currency`, same rounding as `/balances`, so
  the two screens never disagree by a rupee.

### `GET /api/analytics/me?from&to&bucket`

Same envelope, minus `byMember`, plus a per-group breakdown:

```json
{
  "currency": "INR",
  "range": { "from": "…", "to": "…", "bucket": "MONTH" },
  "totals": { "spent": 51400, "expenseCount": 23, "average": 2235, "myShare": 26100, "myPaid": 31000 },
  "byCategory": [ { "category": "Food", "amount": 8200, "share": 15.9 } ],
  "byGroup": [
    { "groupId": "g1", "name": "Goa trip", "spent": 37188, "myShare": 18594, "net": 14206 }
  ],
  "trend": [ { "at": "2026-07-01T00:00:00.000Z", "amount": 14200 } ]
}
```

Here `totals.spent` is **the total of the groups the user is in** and `myShare`
is their part of it — please label them unambiguously in the schema, because
"my spending" could mean either and the chart legend depends on which.

---

## 3. One small addition worth making anyway

Independent of the charts: **put the group's own total on the group object.**

`GroupDto` (both the list and the detail response) currently carries
`memberCount`, `expenseCount` and `myNetBalance`, but not what the group has
spent. The frontend now shows that figure on the group page and derives it by
summing `paid` across `/balances` — correct, but it means the Money list cannot
show a total per group without one balances call per row.

```json
{ "id": "g1", "name": "Goa trip", "memberCount": 2, "expenseCount": 6,
  "totalSpent": 37188, "myNetBalance": 14206, "currency": "INR" }
```

One field, and the Money list can show "₹37,188 spent · you are owed ₹14,206"
for every group in the single request it already makes.

---

## 4. What the frontend will do with it

- Swap `useGroupAnalytics` from client arithmetic to the endpoint. The types are
  already the shape above, so the page itself does not change.
- Drop the 2,000-expense cap and the "showing the most recent 2,000" notice.
- Build the personal dashboard charts on `/api/analytics/me` — spending by
  category and by group over time, on the home page. That is not built today
  precisely because the endpoint's response is unknown.

## 5. Priority

Low. The group page works. `/api/analytics/me`'s schema is the one that unlocks
something we cannot otherwise build, so if only one gets done, that one.
