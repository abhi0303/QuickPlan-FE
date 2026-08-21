import type { TaskPriority } from './tasks'

/**
 * Rule-based natural-language parser for Quick Add.
 *
 * Zero imports beyond a type: no React, no browser globals, no network, and
 * crucially no bundled dataset — the vocabulary is passed in. Drop this file
 * into a Node backend as-is and feed it the same JSON from a DB or an endpoint.
 *
 * `SmartDataset` below IS the contract the dataset must satisfy, in either place.
 */

export type SmartDataset = {
  version: number
  locale: string
  intentPrefixes: string[]
  fillerWords: string[]
  cancelCommands: string[]
  priorities: Record<string, string[]>
  categories: Record<string, string[]>
  relativeDays: Record<string, number>
  weekdays: Record<string, number>
  timeOfDay: Record<string, string>
  months: Record<string, number>
  connectorWords: string[]
  defaults: {
    priority: string
    hourWithoutMeridiem: { assumePmBelow: number }
  }
}

export type ParsedInput = {
  title: string
  dueDate?: string
  priority: TaskPriority
  category?: string
  /** Which parts were recognised — drives the confirmation chips in the UI. */
  matched: {
    time?: string
    date?: string
    priority?: string
    category?: string
  }
}

const WORD_BOUNDARY_SAFE = /[.*+?^${}()|[\]\\]/g

function escapeRegExp(value: string) {
  return value.replace(WORD_BOUNDARY_SAFE, '\\$&')
}

/**
 * Whole-word, case-insensitive match. Multi-word phrases are allowed.
 *
 * Word boundaries are only applied on ends that actually start/finish with a
 * word character — "11:00 p.m." ends in a period, and a trailing \b there can
 * never match, which previously left the time stranded in the title.
 */
function phraseRegExp(phrase: string) {
  const lead = /^\w/.test(phrase) ? '\\b' : ''
  const tail = /\w$/.test(phrase) ? '\\b' : ''
  return new RegExp(`${lead}${escapeRegExp(phrase)}${tail}`, 'i')
}

function stripFirst(text: string, phrase: string) {
  return text.replace(phraseRegExp(phrase), ' ')
}

function tidy(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

/** Longest phrases first, so "day after tomorrow" wins over "tomorrow". */
function byLengthDesc(a: string, b: string) {
  return b.length - a.length
}

function toIsoAt(base: Date, hours: number, minutes: number) {
  const result = new Date(base)
  result.setHours(hours, minutes, 0, 0)
  return result
}

// ---------------------------------------------------------------- time ----

type TimeMatch = {
  hours: number
  minutes: number
  text: string
  /** true only for a vague bare hour ("at 8") — an explicit "9:15" is precise. */
  loose: boolean
}

/**
 * am/pm in every shape it actually arrives in. Speech recognition commonly
 * produces "p.m." or "P.M." rather than "pm", and missing those silently
 * turned every evening time into a morning one.
 */
const MERIDIEM = String.raw`([ap])\.?\s?m\.?`

function isPm(marker: string | undefined) {
  return marker?.toLowerCase() === 'p'
}

function applyMeridiem(hours: number, marker: string | undefined) {
  if (!marker) return hours
  if (isPm(marker) && hours < 12) return hours + 12
  if (!isPm(marker) && hours === 12) return 0
  return hours
}

function extractTime(text: string, data: SmartDataset): TimeMatch | null {
  // "3:30pm", "3.30 p.m.", "11:00 P.M", "03:30", "15:30"
  const clock = text.match(new RegExp(String.raw`\b(\d{1,2})[:.](\d{2})\s*(?:${MERIDIEM})?`, 'i'))
  if (clock) {
    const minutes = Number(clock[2])
    const raw = Number(clock[1])
    if (minutes > 59 || raw > 23) return null
    // An explicit HH:MM is precise even without am/pm — "standup at 9:15" that
    // has passed means tomorrow morning, never 21:15 tonight.
    return {
      hours: applyMeridiem(raw, clock[3]),
      minutes,
      text: clock[0],
      loose: false,
    }
  }

  // "at 5pm", "5 p.m."
  const hourMeridiem = text.match(new RegExp(String.raw`\b(\d{1,2})\s*${MERIDIEM}`, 'i'))
  if (hourMeridiem) {
    const raw = Number(hourMeridiem[1])
    if (raw > 12) return null
    return {
      hours: applyMeridiem(raw, hourMeridiem[2]),
      minutes: 0,
      text: hourMeridiem[0],
      loose: false,
    }
  }

  // named parts of the day, longest first ("tonight" before "night")
  const named = Object.keys(data.timeOfDay).sort(byLengthDesc)
  for (const name of named) {
    const match = text.match(phraseRegExp(name))
    if (!match) continue
    const [hours, minutes] = data.timeOfDay[name].split(':').map(Number)
    return { hours, minutes, text: match[0], loose: false }
  }

  // bare "at 3" — assume afternoon for small numbers, per the dataset default
  const bare = text.match(/\bat\s+(\d{1,2})\b/i)
  if (bare) {
    let hours = Number(bare[1])
    if (hours > 23) return null
    if (hours < data.defaults.hourWithoutMeridiem.assumePmBelow) hours += 12
    return { hours, minutes: 0, text: bare[0], loose: true }
  }

  return null
}

// ---------------------------------------------------------------- date ----

type DateMatch = { date: Date; text: string }

function extractDate(text: string, data: SmartDataset, now: Date): DateMatch | null {
  const relatives = Object.keys(data.relativeDays).sort(byLengthDesc)
  for (const name of relatives) {
    const match = text.match(phraseRegExp(name))
    if (!match) continue
    const result = new Date(now)
    result.setDate(result.getDate() + data.relativeDays[name])
    return { date: result, text: match[0] }
  }

  // "next monday" / "on friday" / "friday"
  const weekdays = Object.keys(data.weekdays).sort(byLengthDesc)
  for (const name of weekdays) {
    const match = text.match(new RegExp(`\\b(next\\s+|this\\s+|on\\s+)?${escapeRegExp(name)}\\b`, 'i'))
    if (!match) continue
    const target = data.weekdays[name]
    const result = new Date(now)
    let delta = (target - result.getDay() + 7) % 7
    // same weekday, or explicitly "next" -> jump a week ahead
    if (delta === 0 || /next/i.test(match[1] ?? '')) delta += 7
    result.setDate(result.getDate() + delta)
    return { date: result, text: match[0] }
  }

  // "21 aug" / "aug 21" / "21st august"
  const months = Object.keys(data.months).sort(byLengthDesc).map(escapeRegExp).join('|')
  const dayMonth = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})\\b`, 'i'))
  const monthDay = text.match(new RegExp(`\\b(${months})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'))
  const ordered = dayMonth
    ? { day: Number(dayMonth[1]), month: dayMonth[2], text: dayMonth[0] }
    : monthDay
      ? { day: Number(monthDay[2]), month: monthDay[1], text: monthDay[0] }
      : null

  if (ordered && ordered.day >= 1 && ordered.day <= 31) {
    const monthIndex = data.months[ordered.month.toLowerCase()]
    const result = new Date(now)
    result.setMonth(monthIndex, ordered.day)
    // a date already gone this year means they mean next year
    if (result < now) result.setFullYear(result.getFullYear() + 1)
    return { date: result, text: ordered.text }
  }

  return null
}

// ------------------------------------------------------------ vocabulary --

/**
 * Returns the winning priority plus EVERY matched phrase, because a sentence
 * can carry more than one ("low priority ... sometime") and any left behind
 * would leak into the title.
 */
function extractPriority(text: string, data: SmartDataset) {
  const entries = Object.entries(data.priorities) as [TaskPriority, string[]][]
  const all = entries.flatMap(([priority, phrases]) => phrases.map((phrase) => ({ priority, phrase })))
  all.sort((a, b) => byLengthDesc(a.phrase, b.phrase))

  let winner: TaskPriority | null = null
  const hits: string[] = []
  let scratch = text

  for (const { priority, phrase } of all) {
    const match = scratch.match(phraseRegExp(phrase))
    if (!match) continue
    if (!winner) winner = priority
    hits.push(match[0])
    scratch = stripFirst(scratch, match[0])
  }

  return winner ? { priority: winner, hits } : null
}

function detectCategory(text: string, data: SmartDataset) {
  const entries = Object.entries(data.categories)
  const all = entries.flatMap(([category, words]) => words.map((word) => ({ category, word })))
  all.sort((a, b) => byLengthDesc(a.word, b.word))

  for (const { category, word } of all) {
    const match = text.match(phraseRegExp(word))
    if (match) return { category, text: match[0] }
  }
  return null
}

function stripIntentPrefix(text: string, data: SmartDataset) {
  const prefixes = [...data.intentPrefixes].sort(byLengthDesc)
  for (const prefix of prefixes) {
    const pattern = new RegExp(`^\\s*${escapeRegExp(prefix)}\\b`, 'i')
    if (pattern.test(text)) return tidy(text.replace(pattern, ' '))
  }
  return text
}

/** Drop connector words left dangling at either end after extraction. */
function trimConnectors(text: string, data: SmartDataset) {
  const connectors = data.connectorWords.map(escapeRegExp).join('|')
  let result = text
  let previous: string
  do {
    previous = result
    result = tidy(result
      .replace(new RegExp(`^(?:${connectors})\\b`, 'i'), '')
      .replace(new RegExp(`\\b(?:${connectors})$`, 'i'), ''))
  } while (result !== previous)
  return result
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * True only when the WHOLE utterance is a close/cancel command.
 *
 * Deliberately an exact match after normalising, never a substring: "cancel the
 * client meeting" is a real task and must not abort the flow.
 */
export function isCancelCommand(input: string, data: SmartDataset): boolean {
  const cleaned = tidy(input.toLowerCase().replace(/[.,!?;:]+/g, ' '))
  if (!cleaned) return false

  let stripped = cleaned
  for (const filler of data.fillerWords) stripped = stripFirst(stripped, filler)
  stripped = tidy(stripped)
  if (!stripped) return false

  return data.cancelCommands.some((command) => command.toLowerCase() === stripped)
}

// ---------------------------------------------------------------- parse ----

export function parseSmartInput(
  input: string,
  data: SmartDataset,
  options: { now?: Date } = {},
): ParsedInput | null {
  const now = options.now ?? new Date()

  const raw = tidy(input)
  if (!raw) return null

  let remaining = raw
  const matched: ParsedInput['matched'] = {}

  const time = extractTime(remaining, data)
  if (time) {
    matched.time = time.text
    remaining = stripFirst(remaining, time.text)
  }

  const date = extractDate(remaining, data, now)
  if (date) {
    matched.date = date.text
    remaining = stripFirst(remaining, date.text)
  }

  const priority = extractPriority(remaining, data)
  if (priority) {
    matched.priority = priority.hits[0]
    for (const hit of priority.hits) remaining = stripFirst(remaining, hit)
  }

  // category words usually belong in the title ("client call"), so detect
  // against the title text but never strip them
  const category = detectCategory(remaining, data)
  if (category) matched.category = category.text

  remaining = stripIntentPrefix(tidy(remaining), data)
  for (const filler of data.fillerWords) remaining = stripFirst(remaining, filler)
  remaining = trimConnectors(tidy(remaining), data)

  const title = capitalize(remaining)
  if (!title) return null

  // A time with no date means the soonest sensible slot: today, or tomorrow if
  // that time has already passed.
  let dueDate: string | undefined
  if (time) {
    const base = date?.date ?? now
    let due = toIsoAt(base, time.hours, time.minutes)

    if (!date && due < now) {
      // "movie at 8" said at 10am means 8pm tonight, not 8am tomorrow. An
      // explicit "9:15" is precise though, so that one rolls to tomorrow.
      const pm = time.loose && time.hours < 12 ? toIsoAt(base, time.hours + 12, time.minutes) : null
      due = pm && pm > now ? pm : toIsoAt(new Date(now.getTime() + 86_400_000), time.hours, time.minutes)
    }
    dueDate = due.toISOString()
  } else if (date) {
    dueDate = toIsoAt(date.date, 9, 0).toISOString()
  }

  return {
    title,
    dueDate,
    priority: priority?.priority ?? (data.defaults.priority as TaskPriority),
    category: category?.category,
    matched,
  }
}
