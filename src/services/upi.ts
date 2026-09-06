/**
 * Paying somebody through UPI, without handling any money.
 *
 * A `upi://pay` link is an instruction to the phone, not a transaction: the
 * chooser opens, the payee and amount are filled in, and the person pays from
 * whichever app they already trust. Nothing passes through this app or its
 * server, which is why it needs no gateway, no registration and no fee.
 *
 * The catch is that a link is fire-and-forget. Only a native Android app can
 * start that intent and read the result back, so the web cannot know whether
 * the payment happened — the person has to say so, and the settlement is
 * recorded from their answer rather than from anything observed here.
 */

/**
 * `name@bank`, where the handle after the @ is the payment provider. Kept
 * deliberately loose on the left: providers allow dots, dashes and digits, and
 * refusing a valid address is worse than accepting an odd-looking one, which
 * the payer sees in their own UPI app before approving anything.
 */
const UPI_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/

/** Longer notes are truncated by the apps themselves, often mid-word. */
const NOTE_LIMIT = 50

export function isValidUpiId(value: string): boolean {
  return UPI_PATTERN.test(value.trim())
}

export function normalizeUpiId(value: string): string {
  return value.trim().toLowerCase()
}

type LinkInput = {
  vpa: string
  /** Shown in the UPI app as the payee, so the payer can check who this is. */
  name?: string
  amount: number
  note?: string
}

/**
 * Encoded by hand rather than with URLSearchParams: that encodes a space as
 * `+`, and several UPI apps show the plus sign in the note instead of reading
 * it back as a space.
 */
function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function buildUpiLink({ vpa, name, amount, note }: LinkInput): string {
  const parts = [`pa=${encode(normalizeUpiId(vpa))}`]
  if (name?.trim()) parts.push(`pn=${encode(name.trim())}`)
  parts.push(`am=${amount.toFixed(2)}`)
  parts.push('cu=INR')
  if (note?.trim()) parts.push(`tn=${encode(note.trim().slice(0, NOTE_LIMIT))}`)
  /* No `tr`: a transaction reference has to be unique per attempt, and a
     repeated one is rejected as a duplicate by some apps — which is exactly
     what happens when somebody taps pay twice after a failed first try. */
  return `upi://pay?${parts.join('&')}`
}

/**
 * iOS has no system-wide handler for `upi://`, so the generic link does
 * nothing there and each app has to be named. Android resolves the generic one
 * into its own chooser, which is better than picking for somebody.
 */
export const UPI_APPS = [
  { id: 'gpay', label: 'Google Pay', scheme: 'gpay://upi/pay?' },
  { id: 'phonepe', label: 'PhonePe', scheme: 'phonepe://pay?' },
  { id: 'paytm', label: 'Paytm', scheme: 'paytmmp://pay?' },
] as const

export function buildAppLink(scheme: string, input: LinkInput): string {
  return `${scheme}${buildUpiLink(input).split('?')[1]}`
}

export type UpiLaunch = 'chooser' | 'apps' | 'none'

/**
 * Where a `upi://` link can actually go, which is not the same question as
 * whether the link is well formed.
 *
 * - `chooser` — Android resolves it into the system's UPI app picker.
 * - `apps` — iOS has no resolver for the bare scheme, so each app is named.
 * - `none` — a desktop has no UPI app at all. The browser answers a link it
 *   cannot open with a console error and nothing else, so offering the button
 *   there is offering a button that does nothing; the address is offered to
 *   copy instead.
 */
export function upiLaunchMode(): UpiLaunch {
  const agent = navigator.userAgent
  // an iPad on desktop-class Safari calls itself a Macintosh, and only the
  // touch count gives it away
  const ios = /iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
  if (ios) return 'apps'
  if (/Android/.test(agent)) return 'chooser'
  return 'none'
}
