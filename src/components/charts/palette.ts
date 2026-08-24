/**
 * Chart colours.
 *
 * A known category keeps the exact tint it wears on the expense row, so a slice
 * of the donut and the glyph beside "Hotel" are the same green. Anything else —
 * an old free-text category, or "Uncategorised" — cycles the series.
 */
export const SERIES = [
  'var(--primary)',
  'var(--periwinkle)',
  'var(--tangerine)',
  'var(--rose)',
  'var(--primary-strong)',
  '#8b5cf6',
  '#0ea5e9',
  '#eab308',
]

import { EXPENSE_CATEGORIES } from '../../data/expenseCategories'

const BY_LABEL = new Map(EXPENSE_CATEGORIES.map((category) => [category.label.toLowerCase(), category.color]))

export function colorFor(label: string, index: number) {
  return BY_LABEL.get(label.trim().toLowerCase()) ?? SERIES[index % SERIES.length]
}
