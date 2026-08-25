# Personal expenses — making your own spending first-class

**For:** QuickPlan API team + frontend
**Status:** proposal, not built
**Related:** `docs/analytics-api.md`, `docs/notifications-api.md`

---

## 1. Why

Every expense today belongs to a **group** and splits into **shares**. That is
right for a trip, and wrong for a coffee.

The evidence is in the product: there is a group called **"Self"**, with one
member, described as *"for recording my own expenses"*. The app made someone
invent a container to hold something it should have held directly. A one-member
group means a pointless "who paid" field, a pointless split, a balances panel
that always says settled, and a "1 member" label on the Money page.

This is also the single change that unlocks the most elsewhere:

- **Voice can create expenses again.** `POST /api/v1/smart-input` currently
  returns `result: null` for money intents, because a sentence cannot say which
  group an expense belongs to. A personal expense has no such question — "spent
  400 on petrol" is complete. That re-enables voice expense capture, and with it
  the `EXPENSE_COUNT` missions for people who never use groups.
- **Daily spend analytics become real.** Right now "my spending" means "my share
  of group expenses". Most people's spending is not that.

---

## 2. The model decision, and why

Two options were considered.

**A separate `personal_expenses` table.** Keeps the invariant clean — a group
expense always has a group and shares. But it duplicates CRUD, categories,
filters, analytics and export, and every one of those has to be kept in step
forever. Two tables that mean "money that left your account" is a maintenance
tax with no upside.

**One `expenses` table with a scope** — the recommendation:

```
expenses
  id              uuid   pk
  scope           enum   PERSONAL | GROUP        -- new, NOT NULL, default GROUP
  ownerId         uuid   fk → users              -- new, NOT NULL: whose ledger
  groupId         uuid   fk → groups, NULL       -- now nullable
  title           text
  totalAmount     numeric
  currency        text
  category        text null
  date            timestamptz
  notes           text null                      -- optional, useful for personal
  paidById        uuid null                      -- GROUP only
  createdById     uuid
  splitType       enum null                      -- GROUP only
  createdVia      enum                           -- MANUAL | VOICE | IMPORT | SYSTEM
  createdAt / updatedAt

  check (scope = 'GROUP' and group_id is not null and paid_by_id is not null
      or scope = 'PERSONAL' and group_id is null and paid_by_id is null)
  index (owner_id, scope, date desc)
```

`ownerId` matters: for a personal expense it is the ledger it belongs to; for a
group expense set it to the payer so a single index answers "everything that
affects this person's money".

The database **check constraint is the point**. It is what stops the nullable
`groupId` from quietly becoming "sometimes there are shares, sometimes not, who
knows" six months from now.

**Migration:** existing rows get `scope = 'GROUP'` and `ownerId = paidById`. No
data moves. A one-member "Self" group can stay exactly as it is — see §7.

---

## 3. Endpoints

### 3.1 Create — `POST /api/expenses`

```json
{
  "title": "Petrol",
  "totalAmount": 400,
  "category": "Fuel",
  "date": "2026-08-25T09:12:00.000Z",
  "notes": "Indian Oil, Sector 18",
  "createdVia": "VOICE"
}
```

- `date` optional, defaults to now. `category` free text as today.
- `createdVia` as on tasks and reminders, so voice missions can count these.
- Returns the same envelope as a group expense, with `scope: "PERSONAL"`,
  `groupId: null`, `shares: []`, `myShare` equal to `totalAmount`.

**Keeping `myShare` populated for personal expenses is deliberate** — the
frontend already renders `myShare` everywhere, and "your share of your own
expense" is the whole amount. It means the expense row component works for both
kinds with no branching.

### 3.2 List — `GET /api/expenses`

Query: `from`, `to`, `category`, `limit` (max 200), `offset`.

Same paginated envelope as the group list, newest first **by `date`**, not by
creation — a backdated expense belongs where it happened:

```json
{ "total": 42, "limit": 50, "offset": 0, "items": [ … ] }
```

### 3.3 Detail, edit, delete

`GET`, `PATCH` and `DELETE /api/expenses/:id` already exist. They need to accept
personal expenses, authorised by `ownerId` rather than group membership. A
`PATCH` may not change `scope` — moving an expense between personal and a group
is a different operation, and probably not one worth having.

### 3.4 Analytics — one new parameter

`GET /api/analytics/me?scope=PERSONAL|GROUP|ALL` (default `ALL`).

The response shape is unchanged, but `totals.spent` needs an unambiguous
meaning per scope:

| scope | `totals.spent` means |
|---|---|
| `PERSONAL` | the sum of personal expenses |
| `GROUP` | the caller's **share** of group expenses |
| `ALL` | both added — what actually left this person's money |

Please label these in the schema. "My spending" is the single most
misinterpretable number in the app.

### 3.5 Voice — `POST /api/v1/smart-input`

Money intents currently return `result: null`. With personal expenses they can
create one and return it, tagged `createdVia: "VOICE"`. The rule stays: **voice
never creates a group expense**, because a sentence cannot name the group or the
people. If the parse mentions another person ("gave Rahul 500"), keep returning
the message that points at Money — that is an IOU, not a personal expense.

---

## 4. Frontend work

- **Money becomes two views:** *Personal* and *Groups*. Personal is the default
  for a user with no groups, which is most new users on day one.
- The personal list reuses the expense row wholesale — the category glyph, the
  amount, the date. It drops the payer line and the share column, since both are
  always "you".
- **Quick Add gets its money tab back**, personal-only, and the on-device parser
  already produces amount, category and date. Voice expense capture returns.
- **The analysis page gains a scope switch** — personal, group, or everything —
  reusing the drill-down timeline and the donut as they are.
- The "Self" group, if the user has one, gets a one-time prompt offering to move
  its expenses into the personal ledger (see below).

---

## 5. Edge cases worth deciding now

| Case | Suggested behaviour |
|---|---|
| Personal expense with a `groupId` in the body | 400. The check constraint should never be reachable from the API. |
| Group expense created through `POST /api/expenses` | 400 with a message pointing at the group route. |
| Deleting a user | Personal expenses go with them; group expenses stay, since other people's balances depend on them. |
| Currency | Personal expenses use the user's currency; no cross-currency maths in this round. |
| `myShare` on a personal expense | equals `totalAmount`, always. |
| Sorting | by `date`, then `id` — stable, and matches the group list. |

---

## 6. Acceptance checks

| Case | Expected |
|---|---|
| `POST /api/expenses` minimal body | 201, `scope: PERSONAL`, `shares: []`, `myShare == totalAmount` |
| Same, with `createdVia: VOICE` | recorded as VOICE; an `EXPENSE_COUNT` mission advances |
| `GET /api/expenses` | only the caller's personal expenses — never a group's |
| `GET /api/groups/:id/expenses` | only that group's — never a personal one |
| `PATCH` someone else's personal expense | 404 |
| `analytics/me?scope=PERSONAL` vs `GROUP` vs `ALL` | third equals the first two summed |
| Voice: "spent 400 on petrol" | creates a personal expense |
| Voice: "gave Rahul 500" | still returns the group message, creates nothing |

---

## 7. Migration for people already using a "Self" group

Do **not** migrate automatically. Someone may have a legitimately small group.

Offer it instead: when a group has one member and no settlements, the frontend
shows "Move these to your personal expenses?" once. If accepted, call

```
POST /api/groups/:id/convert-to-personal
```

which rewrites those expenses to `scope: PERSONAL`, `ownerId` = the member,
drops the shares, and deletes the group in one transaction. Reversible only by
re-entering the data, so it asks first and says so plainly.

---

## 8. Phasing

**Phase 1** — the column, the constraint, create/list/detail/edit/delete, and the
Money split in the UI. This is the useful part.

**Phase 2** — analytics `scope`, voice money intents, the "Self" conversion.

Phase 1 alone removes the workaround; phase 2 is what makes it feel designed
rather than added.
