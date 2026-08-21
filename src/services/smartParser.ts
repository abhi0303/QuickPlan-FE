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
  reminderTriggers: string[]
  expense: {
    paidByMe: string[]
    paidToMe: string[]
    currencyWords: string[]
    reasonPrefixes: string[]
    personPrefixes: string[]
    anonymousPersons: string[]
  }
  splitSkipAnswers: string[]
  nameJoiners: string[]
  recurrence: Record<string, string[]>
  defaults: {
    priority: string
    hourWithoutMeridiem: { assumePmBelow: number }
  }
}

export type ParsedIntent = 'task' | 'reminder' | 'expense'
export type ExpenseDirection = 'PAYABLE' | 'RECEIVABLE'

export type ParsedInput = {
  /** Which module this belongs to, and therefore which form and API to use. */
  intent: ParsedIntent
  title: string
  dueDate?: string
  priority: TaskPriority
  category?: string
  /** reminder only — DAILY / WEEKLY / WEEKDAYS / MONTHLY */
  recurrenceRule?: string
  /** expense only */
  amount?: number
  /** RECEIVABLE: they owe me. PAYABLE: I owe them. */
  direction?: ExpenseDirection
  personName?: string
  reason?: string
  /** Which parts were recognised — drives the confirmation chips in the UI. */
  matched: {
    time?: string
    date?: string
    priority?: string
    category?: string
    intent?: string
    amount?: string
    person?: string
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

// ------------------------------------------------------------- intent -----

/** Longest phrase first, so "paid me" beats "paid". */
function findPhrase(text: string, phrases: string[]) {
  const sorted = [...phrases].sort(byLengthDesc)
  for (const phrase of sorted) {
    const match = text.match(phraseRegExp(phrase))
    if (match) return { phrase, text: match[0], index: match.index ?? 0 }
  }
  return null
}

/**
 * Money amount. Runs only after the time has been stripped, so "3:30" can no
 * longer be mistaken for a quantity.
 */
function extractAmount(text: string, data: SmartDataset) {
  const currency = data.expense.currencyWords.map(escapeRegExp).join('|')

  // "₹500", "rs 500", "500 rupees", or a bare number next to a money verb
  const patterns = [
    new RegExp(String.raw`(?:₹|\brs\.?\s*|\binr\s*)(\d+(?:[.,]\d+)?)`, 'i'),
    new RegExp(String.raw`\b(\d+(?:[.,]\d+)?)\s*(?:${currency})\b`, 'i'),
    new RegExp(String.raw`\b(\d+(?:[.,]\d+)?)\b`),
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const value = Number(match[1].replace(/,/g, ''))
    if (Number.isFinite(value) && value > 0) return { amount: value, text: match[0] }
  }
  return null
}

/** Name(s) following "to"/"from", stopping at a connector or money word. */
function extractPerson(text: string, data: SmartDataset) {
  const prefixes = data.expense.personPrefixes.map(escapeRegExp).join('|')
  const match = text.match(new RegExp(String.raw`\b(?:${prefixes})\s+([a-z][\w']*(?:\s+[a-z][\w']*)?)`, 'i'))
  if (!match) return null

  const stop = new Set([...data.connectorWords, ...data.expense.currencyWords, ...data.fillerWords])
  const words = match[1].split(/\s+/).filter((word) => !stop.has(word.toLowerCase()))
  if (!words.length) return null

  const name = words.join(' ')
  if (data.expense.anonymousPersons.some((generic) => generic === name.toLowerCase())) {
    return { name: null, text: match[0] }
  }
  return { name: capitalize(name), text: match[0] }
}

function extractReason(text: string, data: SmartDataset) {
  const prefixes = data.expense.reasonPrefixes.map(escapeRegExp).join('|')
  const match = text.match(new RegExp(String.raw`\b(?:${prefixes})\s+(.+)$`, 'i'))
  if (!match) return null
  const reason = trimConnectors(tidy(match[1]), data)
  return reason ? { reason, text: match[0] } : null
}

function extractRecurrence(text: string, data: SmartDataset) {
  const entries = Object.entries(data.recurrence)
  const all = entries.flatMap(([rule, phrases]) => phrases.map((phrase) => ({ rule, phrase })))
  all.sort((a, b) => byLengthDesc(a.phrase, b.phrase))

  for (const { rule, phrase } of all) {
    const match = text.match(phraseRegExp(phrase))
    if (match) return { rule, text: match[0] }
  }
  return null
}

/**
 * Splits a spoken list of names: "Rahul and Ravina and Suraj" or
 * "Rahul, Ravina & Suraj". Returns [] when the reply means "nobody".
 */
export function parseNameList(input: string, data: SmartDataset): string[] {
  const cleaned = tidy(input.toLowerCase().replace(/[.!?]+/g, ' '))
  if (!cleaned) return []
  if (data.splitSkipAnswers.some((answer) => answer === cleaned)) return []

  const joiners = data.nameJoiners.map(escapeRegExp).join('|')
  const parts = cleaned
    .split(new RegExp(String.raw`\s*,\s*|\s+(?:${joiners})\s+`, 'i'))
    .map((part) => trimConnectors(tidy(part), data))
    .filter(Boolean)

  const stop = new Set([...data.fillerWords, ...data.splitSkipAnswers, ...data.connectorWords])
  return parts
    .filter((part) => !stop.has(part))
    .map((part) => part.split(/\s+/).map(capitalize).join(' '))
}

/** True when a reply to "who shall I add?" means "just me". */
export function isSkipAnswer(input: string, data: SmartDataset): boolean {
  const cleaned = tidy(input.toLowerCase().replace(/[.,!?]+/g, ' '))
  if (!cleaned) return true
  return data.splitSkipAnswers.some((answer) => answer === cleaned)
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

  // ---- intent: expense first (money verb + amount), then reminder, else task

  const paidByMe = findPhrase(remaining, data.expense.paidByMe)
  const paidToMe = findPhrase(remaining, data.expense.paidToMe)
  const moneyVerb = paidToMe ?? paidByMe
  const amount = moneyVerb ? extractAmount(remaining, data) : null

  let intent: ParsedIntent = 'task'
  let direction: ExpenseDirection | undefined
  let personName: string | undefined
  let reason: string | undefined
  let recurrenceRule: string | undefined

  if (moneyVerb && amount) {
    intent = 'expense'
    // The participants are captured separately, so a trailing "with Rahul and
    // Ravina" must not end up inside the expense title.
    remaining = tidy(remaining.replace(/\bwith\b\s+.*$/i, ' '))
    // "they paid me" -> I owe them. "I paid them" -> they owe me.
    direction = paidToMe ? 'PAYABLE' : 'RECEIVABLE'
    matched.intent = moneyVerb.text
    matched.amount = amount.text

    if (paidToMe) {
      // "Rahul paid me 500" — the payer is whatever precedes the verb
      const lead = trimConnectors(tidy(remaining.slice(0, paidToMe.index)), data)
      const words = lead.split(/\s+/).filter(Boolean)
      const isAnonymous = data.expense.anonymousPersons.includes(lead.toLowerCase())
      if (lead && !isAnonymous && words.length <= 2) {
        personName = words.map(capitalize).join(' ')
        matched.person = personName
      }
      if (lead) remaining = remaining.replace(lead, ' ')
    } else {
      const person = extractPerson(remaining, data)
      if (person?.name) {
        personName = person.name
        matched.person = person.name
      }
      if (person) remaining = stripFirst(remaining, person.text)
    }

    const reasonMatch = extractReason(remaining, data)
    if (reasonMatch) {
      reason = reasonMatch.reason
      remaining = stripFirst(remaining, reasonMatch.text)
    }

    remaining = stripFirst(remaining, amount.text)
    remaining = stripFirst(remaining, moneyVerb.text)
    for (const word of data.expense.currencyWords) remaining = stripFirst(remaining, word)
  } else {
    const reminder = findPhrase(remaining, data.reminderTriggers)
    if (reminder) {
      intent = 'reminder'
      matched.intent = reminder.text
      remaining = stripFirst(remaining, reminder.text)

      const recurrence = extractRecurrence(remaining, data)
      if (recurrence) {
        recurrenceRule = recurrence.rule
        remaining = stripFirst(remaining, recurrence.text)
      }
    }
  }

  remaining = stripIntentPrefix(tidy(remaining), data)
  for (const filler of data.fillerWords) remaining = stripFirst(remaining, filler)
  remaining = trimConnectors(tidy(remaining), data)

  // A bare trigger ("set an alarm") strips down to nothing, so fall back to a
  // sensible label rather than rejecting the utterance.
  let title = capitalize(remaining)
  if (!title && intent === 'expense') {
    title = capitalize(reason ?? (personName ? `Paid ${personName}` : 'Expense'))
  }
  // Reminder triggers are often the noun itself ("doctor appointment"), so
  // keep that word in the title rather than consuming it with the trigger.
  if (intent === 'reminder') {
    const trigger = matched.intent ?? ''
    const noun = /appointment/i.test(trigger) ? 'appointment'
      : /alarm/i.test(trigger) ? 'alarm'
        : /meeting/i.test(trigger) ? 'meeting'
          : null

    if (noun) {
      if (!title) title = capitalize(noun)
      else if (!phraseRegExp(noun).test(title)) title = `${title} ${noun}`
    } else if (!title) {
      title = 'Reminder'
    }
  }
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
    intent,
    title,
    dueDate,
    priority: priority?.priority ?? (data.defaults.priority as TaskPriority),
    category: category?.category,
    recurrenceRule,
    amount: amount?.amount,
    direction,
    personName,
    reason,
    matched,
  }
}
