# Consent and policies — what we ask, what we record

Written for the backend team and for whoever builds the frontend side. Section 9
is the only part that needs a lawyer; everything else is engineering.

---

## 1. The gap

Anyone can create an account today without being shown a single term, and
nothing anywhere records that they agreed to anything. There are no policy
pages to link to even if we wanted to.

That blocks three separate things:

- **India's DPDP Act, 2023** requires consent that is free, specific, informed
  and given by clear affirmative action, with a notice saying what we collect
  and why. A signup form with no notice and no checkbox does not meet that.
- **Razorpay activation** (and every payment provider) checks for published
  Terms, Privacy Policy, Refund/Cancellation and Contact pages before approving
  a merchant account.
- **App store listings**, if we ever ship a native wrapper, require a privacy
  policy URL and a working account-deletion route.

---

## 2. The decision that shapes everything else

**Store the version accepted, not a boolean.**

A `hasAcceptedTerms: true` column answers "did they tick a box" and nothing
else. It cannot answer the question that actually comes up — *which* terms did
this person agree to, and do they need to see the new ones. Terms change; a
boolean quietly becomes a lie the first time they do.

So: `termsVersion` (a string like `2026-09-10`) plus `termsAcceptedAt`. When the
published version is newer than the stored one, the app asks again. When it is
not, nobody is bothered.

---

## 3. What we ask, and when

### 3.1 At signup — one checkbox, unticked

> ☐ I agree to the [Terms of Use](/terms) and [Privacy Policy](/privacy), and I
> am 18 or older.

Three things bundled deliberately, because all three are *conditions of using
the service at all* rather than optional extras:

- **Terms of Use** — the contract.
- **Privacy Policy** — the DPDP notice. It must be readable *before* agreeing,
  which is why these are links and not fine print.
- **18 or older** — DPDP sets the age of a child at **18**, not 13 or 16, and
  processing a child's data needs verifiable parental consent. A self-declaration
  is the proportionate answer for an app of this size; anything else means
  building age verification.

**It must start unticked.** A pre-ticked box is not consent under DPDP — nor
under GDPR, if we ever have a user in the EU. Signup is refused until it is
ticked, with an inline error rather than a silent disabled button.

### 3.2 What must NOT be bundled into that checkbox

| Consent | Why it stands alone |
|---|---|
| Marketing / product emails | Bundling it with terms invalidates both. Separate, optional, unticked — and only when we actually send them. We send none today. |
| Push notifications | Already a separate in-app toggle backed by the browser permission. Leave it there. |
| Microphone | Browser permission. See §5. |
| Reading bank SMS or email | Sensitive financial data, and a purpose we do not have yet. Separate, explicit, at the moment the feature is first used. See §6. |

Transactional email — verification, password reset — needs no consent. It is
the service working.

### 3.3 While signed in

Settings gains a **Legal** section: links to both policies, plus a quiet line
saying which version was accepted and when. That line is the user-facing half
of §2, and it is also how we answer a support question in ten seconds.

---

## 4. Existing accounts

The ask was "update the flag in the DB for everyone who already signed up".
Worth separating two things that look the same:

**Backfilling the column** — yes, do it. Every existing row gets
`termsVersion = 'legacy'` and `termsAcceptedAt = createdAt`, so the column is
never null and no query has to special-case it.

**Treating that as consent** — no. Those twelve people never saw a policy,
because there wasn't one. Marking them as having agreed to something that did
not exist when they signed up is exactly the kind of record that is worthless
the one time it matters.

**So:** backfill as `legacy`, and because `legacy` is older than the published
version, everyone sees a one-time acceptance screen on their next visit. It is
one tap for them and it produces a record that is actually true.

---

## 5. The microphone, and where the audio goes

Worth checking before we write the privacy policy, because the answer changes
what the policy has to say.

Voice input uses the browser's speech recognition. In Chrome, **audio is sent
to Google's servers for transcription** — it does not stay on the device. If
that is what we are doing, the privacy policy must say so plainly: *"when you
use voice input, your browser sends the recording to its speech service."*

We do not store audio and never have. That should be said too, because it is
the thing people assume we do.

---

## 6. Consents we will need later — flagged now so the schema fits

- **Bank SMS / transaction email reading** (the capture tray). Explicit,
  separate, and purpose-limited. The notice has to say we read only messages
  the user shares with us and store only amount, merchant, date and category —
  never the raw message, which carries account numbers.
- **Contact or friend data.** Adding a friend processes someone else's name and
  email. Covered by the privacy policy today; it needs a sentence, not a
  checkbox.
- **UPI IDs.** A saved UPI ID is shown to anyone sharing a group. The Settings
  copy already says so; the policy should too.

---

## 7. Backend work

### 7.1 Schema

```
users.terms_version      text        null        -- e.g. "2026-09-10" or "legacy"
users.terms_accepted_at  timestamptz null
```

Nullable in the migration, backfilled in the same migration (§4), never null
afterwards.

### 7.2 Register

`POST /api/auth/register` gains two body fields:

```json
{ "name": "...", "email": "...", "password": "...",
  "acceptedTerms": true, "termsVersion": "2026-09-10" }
```

- `acceptedTerms` must be exactly `true`. Anything else → **400**, message:
  *"Please accept the Terms of Use and Privacy Policy to continue."*
- `termsVersion` is stored as sent. Reject an unknown version → **400**, so a
  stale cached frontend cannot record consent to a version that never existed.
- `terms_accepted_at` is set server-side from the server clock, never from the
  client.

### 7.3 Re-consent

```
POST /api/user/accept-terms      { "termsVersion": "2026-09-10" }
→ 200 { "termsVersion": "...", "termsAcceptedAt": "..." }
```

Authenticated. Used by the one-time screen in §4 and whenever the version moves.
A dedicated route rather than `PATCH /api/user/me`, so that accepting terms can
never be a side effect of editing a profile.

### 7.4 Reads

`GET /api/user/me` returns `termsVersion` and `termsAcceptedAt`. The frontend
compares against the version it was built with; no endpoint needed for "what is
current".

### 7.5 Account deletion

DPDP gives a right to erasure, and every app store requires a deletion route.
We have sign-out and nothing else.

```
DELETE /api/user/me
```

Authenticated, and it should require the current password in the body — the same
reasoning as change-password: a live session is not proof of ownership.

What it does needs a decision, because a user is entangled with other people:

- **Personal** data — expenses, tasks, reminders, budgets, plans, recurring: delete.
- **Group** data — expenses they created and settlements they are part of:
  **keep, anonymise the actor.** Deleting them would silently rewrite three
  other people's balances, which is worse for those people than a row saying
  "a removed member".
- Name and email replaced with a tombstone; the row itself stays for the
  foreign keys.

This is the part of the document most worth agreeing on before anyone writes
code.

---

## 8. Frontend work

- **Signup** — the checkbox from §3.1, unticked, blocking, with links that open
  the policies without losing the half-filled form.
- **`/terms` and `/privacy`** — public routes, outside the auth guard, exactly
  like `/verify-email`. They must be readable signed out; that is most of the
  point.
- **Under the sign-in button** — a quiet line: *Terms · Privacy*. Visible on
  both tabs, since people read it before deciding to sign up.
- **Settings → Legal** — both links, plus "Accepted version 2026-09-10 on 10 Sep 2026".
- **Re-consent screen** — shown when `termsVersion` from the API is older than
  the built-in current version. One screen, what changed, one button.
- **Policy content ships with the frontend** as ordinary pages, not from an
  endpoint. It is versioned with the app, needs no request, and works offline.
  The version string lives in one constant next to it.

---

## 9. The part that needs a lawyer

Everything above is mechanism. The words in the two policies are not, and a
generic template is a liability rather than a shortcut — it will describe data
we do not collect and miss the things we do.

At minimum the privacy policy has to state, specifically for this app: what we
store (expenses, group membership, UPI IDs, email), why, how long, who it is
shared with (each other, within groups), that voice goes to the browser's speech
service (§5), the rights available under DPDP, and a named contact for
grievances — which the DPDP Act requires us to publish.

I can draft all of it as a starting point. It should be reviewed before it goes
live, not after.

---

## 10. Acceptance checks

- Signup with the box unticked is refused, with a visible reason.
- Signup with `acceptedTerms: false` sent directly to the API returns 400.
- A registered user's row has a non-null `terms_version` and `terms_accepted_at`.
- Every pre-existing user has `terms_version = 'legacy'`.
- A `legacy` user sees the acceptance screen once, and not again after accepting.
- `/terms` and `/privacy` load signed out, and survive a hard refresh (they are
  real routes, not modals).
- Settings shows the accepted version and date.
- `DELETE /api/user/me` with a wrong password returns 401 and deletes nothing.
