import {
  BedDouble,
  Bus,
  CalendarClock,
  Cigarette,
  Fuel,
  Gift,
  HeartPulse,
  House,
  Landmark,
  PiggyBank,
  Plane,
  ReceiptText,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  SquareParking,
  Ticket,
  UtensilsCrossed,
  Wallet,
  Wine,
  Wrench,
} from 'lucide-react'

/**
 * Expense categories, in one place.
 *
 * The API stores `category` as free text, so this list is the frontend's own —
 * an expense created before a category existed keeps its string and simply
 * falls back to the neutral look. Order is roughly how often a category comes
 * up on a trip or in a shared flat, since that is the order of the dropdown.
 *
 * Each entry owns its glyph and its colour, so the icon on an expense row, the
 * slice in the donut and the legend swatch are all the same green without three
 * lists having to agree.
 */
export type ExpenseCategory = {
  label: string
  icon: typeof Wallet
  /** Class suffix used by `.expense-icon.tone-*`. */
  tone: string
  /** Chart colour: a token where one exists, otherwise a literal. */
  color: string
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { label: 'Food', icon: UtensilsCrossed, tone: 'tone-food', color: 'var(--tangerine)' },
  { label: 'Groceries', icon: ShoppingBasket, tone: 'tone-groceries', color: '#16a34a' },
  { label: 'Drinks', icon: Wine, tone: 'tone-drinks', color: '#a855f7' },
  { label: 'Smoke', icon: Cigarette, tone: 'tone-smoke', color: '#a16207' },
  { label: 'Travel', icon: Plane, tone: 'tone-travel', color: 'var(--periwinkle)' },
  { label: 'Fuel', icon: Fuel, tone: 'tone-fuel', color: '#ef4444' },
  { label: 'Parking', icon: SquareParking, tone: 'tone-parking', color: '#0ea5e9' },
  { label: 'Local transport', icon: Bus, tone: 'tone-transport', color: '#f59e0b' },
  { label: 'Stay', icon: BedDouble, tone: 'tone-stay', color: 'var(--primary)' },
  { label: 'Activities', icon: Ticket, tone: 'tone-activities', color: '#14b8a6' },
  { label: 'Shopping', icon: ShoppingBag, tone: 'tone-shopping', color: 'var(--rose)' },
  // Paying somebody to keep the household running: pressing and washing, and
  // the tap, the geyser, the electrician. Kept out of Bills because a bill
  // arrives whether or not anything happened.
  { label: 'Laundry', icon: Shirt, tone: 'tone-laundry', color: '#0891b2' },
  { label: 'Repairs', icon: Wrench, tone: 'tone-repairs', color: '#78716c' },
  // The commitments cluster: money that leaves on a date somebody else chose.
  // Rent earns its own entry rather than falling under Bills — it is the
  // largest line most people have, and the API already sends it as a category.
  { label: 'Rent', icon: House, tone: 'tone-rent', color: '#1d4ed8' },
  { label: 'Bills', icon: ReceiptText, tone: 'tone-bills', color: '#6366f1' },
  { label: 'EMI', icon: CalendarClock, tone: 'tone-emi', color: '#7c3aed' },
  { label: 'Loan', icon: Landmark, tone: 'tone-loan', color: '#0e7490' },
  // SIPs, FDs and RDs: money that leaves the account on a schedule like the two
  // above it, but comes back. "Investments" rather than "Savings" because a SIP
  // is not saving, and because savings also means "what I did not spend" —
  // which is the opposite of a row in a list of outgoings.
  { label: 'Investments', icon: PiggyBank, tone: 'tone-investments', color: '#65a30d' },
  { label: 'Health', icon: HeartPulse, tone: 'tone-health', color: '#e11d48' },
  { label: 'Gifts', icon: Gift, tone: 'tone-gifts', color: '#d946ef' },
  { label: 'Other', icon: Wallet, tone: 'tone-other', color: '#64748b' },
]

/** Anything unrecognised — including categories from before this list grew. */
export const UNCATEGORISED: ExpenseCategory = {
  label: 'Uncategorised', icon: Wallet, tone: 'tone-plain', color: '#94a3b8',
}

const BY_LABEL = new Map(EXPENSE_CATEGORIES.map((category) => [category.label.toLowerCase(), category]))

/**
 * Older expenses may carry a label this list no longer has, and free text means
 * anything is possible, so matching is case-insensitive with a neutral fallback
 * rather than a lookup that can fail.
 */
export function categoryLook(name?: string | null): ExpenseCategory {
  if (!name) return UNCATEGORISED
  return BY_LABEL.get(name.trim().toLowerCase()) ?? UNCATEGORISED
}
