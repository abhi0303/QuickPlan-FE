import { describe, expect, it } from 'vitest'
import { isCancelCommand, isSkipAnswer, parseNameList, parseSmartInput } from './smartParser'
import data from '../data/smartInput.en.json'
import type { SmartDataset } from './smartParser'

/**
 * The parser is the riskiest code in the app: intricate, entirely rule-based,
 * and invisible when it breaks — a wrong answer still looks like an answer.
 *
 * Assertions are on **local** date parts rather than ISO strings. The parser
 * builds dates in the machine's timezone, so `2026-08-26T11:30:00.000Z` is only
 * correct in IST and this suite has to pass on a CI runner in UTC.
 */

const dataset = data as SmartDataset

/** A Tuesday, mid-morning. Every expectation below is relative to it. */
const NOW = new Date(2026, 7, 25, 10, 0, 0)

const parse = (text: string) => parseSmartInput(text, dataset, { now: NOW })

/** Local wall-clock parts of a parsed due date. */
function due(text: string) {
  const parsed = parse(text)
  if (!parsed?.dueDate) return null
  const at = new Date(parsed.dueDate)
  return { date: at.getDate(), month: at.getMonth() + 1, hours: at.getHours(), minutes: at.getMinutes() }
}

describe('intent', () => {
  it.each([
    ['remind me to call Rahul tomorrow at 5 pm', 'reminder'],
    ['set a reminder for dentist appointment on 27 August 1:45 pm', 'reminder'],
    ['add a task to send the client proposal on Friday', 'task'],
    ['buy groceries', 'task'],
    ['spent 400 on petrol', 'expense'],
    ['paid 250 for lunch', 'expense'],
  ])('%s → %s', (input, intent) => {
    expect(parse(input)?.intent).toBe(intent)
  })

  it('returns null for something with no content of its own', () => {
    expect(parse('   ')).toBeNull()
  })
})

describe('title', () => {
  it.each([
    ['remind me to call Rahul tomorrow at 5 pm', 'Call Rahul'],
    ['add a task to send the client proposal on Friday', 'Send the client proposal'],
    ['buy groceries', 'Buy groceries'],
    ['set a reminder for dentist appointment on 27 August 1:45 pm', 'Dentist appointment'],
    ['remind me to take medicine every day at 9 pm', 'Take medicine'],
    ['spent 400 on petrol', 'Petrol'],
  ])('%s → %s', (input, title) => {
    expect(parse(input)?.title).toBe(title)
  })

  it.each([
    ['remind me to call Rahul tomorrow at 5 pm', /tomorrow|5\s*pm|remind me/i],
    ['add a task to send the client proposal on Friday', /friday|add a task/i],
    ['spent 400 rupees on petrol', /400|rupees|spent/i],
    ['remind me to take medicine every day at 9 pm', /every day|9\s*pm/i],
  ])('%s keeps nothing it consumed', (input, consumed) => {
    expect(parse(input)?.title).not.toMatch(consumed)
  })
})

describe('time of day', () => {
  it('tomorrow at 5 pm is 17:00 the next day', () => {
    expect(due('remind me to call Rahul tomorrow at 5 pm')).toEqual({ date: 26, month: 8, hours: 17, minutes: 0 })
  })

  // the bug that shipped once: every spoken time came back as am
  it('tomorrow at 5 am is 05:00, not 17:00', () => {
    expect(due('remind me to call Rahul tomorrow at 5 am')).toEqual({ date: 26, month: 8, hours: 5, minutes: 0 })
  })

  it('keeps the minutes from an explicit date and time', () => {
    expect(due('set a reminder for dentist appointment on 27 August 1:45 pm'))
      .toEqual({ date: 27, month: 8, hours: 13, minutes: 45 })
  })

  it('reports which fragment it read as the time', () => {
    expect(parse('remind me to call Rahul tomorrow at 5 pm')?.matched.time).toBe('5 pm')
  })

  it('leaves the due date empty when no time was said', () => {
    const parsed = parse('remind me to buy milk')
    expect(parsed?.dueDate).toBeUndefined()
    expect(parsed?.matched.time).toBeFalsy()
  })
})

describe('weekdays', () => {
  it('a weekday later this week stays in this week', () => {
    // Tuesday the 25th → Friday the 28th
    expect(due('add a task to send the client proposal on Friday')?.date).toBe(28)
  })
})

describe('recurrence', () => {
  it.each([
    ['remind me to take medicine every day at 9 pm', 'DAILY'],
    ['remind me to submit the report every week at 10 am', 'WEEKLY'],
    ['remind me to pay rent every month at 9 am', 'MONTHLY'],
    ['remind me to stand up every weekday at 11 am', 'WEEKDAYS'],
  ])('%s → %s', (input, rule) => {
    expect(parse(input)?.recurrenceRule).toBe(rule)
  })

  it('is a reminder concept — a task does not carry one', () => {
    expect(parse('gym every day at 6 am')?.recurrenceRule).toBeUndefined()
  })
})

describe('priority and category', () => {
  it('reads an explicit priority word', () => {
    expect(parse('urgent submit the report by tonight')?.priority).toBe('URGENT')
  })

  it('defaults to MEDIUM', () => {
    expect(parse('buy groceries')?.priority).toBe('MEDIUM')
  })

  it.each([
    ['add a task to send the client proposal on Friday', 'Work'],
    ['buy groceries', 'Personal'],
    ['remind me to take medicine every day at 9 pm', 'Health'],
  ])('%s → %s', (input, category) => {
    expect(parse(input)?.category).toBe(category)
  })

  it('keeps the category word in the title rather than eating it', () => {
    expect(parse('add a task to send the client proposal on Friday')?.title).toContain('client')
  })
})

describe('money', () => {
  it.each([
    ['spent 400 on petrol', 400],
    ['paid 250 for lunch', 250],
    ['spent 1200 rupees on dinner', 1200],
    ['paid rs 90 for chai', 90],
  ])('%s → %s', (input, amount) => {
    expect(parse(input)?.amount).toBe(amount)
  })

  it('a number with no money verb is not an expense', () => {
    expect(parse('call Rahul 3 times')?.intent).not.toBe('expense')
  })
})

describe('who owes whom', () => {
  // "they paid me" leaves me owing them; "I paid them" leaves them owing me
  it('reads money coming to me as something I owe back', () => {
    const parsed = parse('Rahul paid me 500')
    expect(parsed?.direction).toBe('PAYABLE')
    expect(parsed?.personName).toBe('Rahul')
    expect(parsed?.amount).toBe(500)
  })

  it('reads money I handed over as something owed to me', () => {
    expect(parse('I gave Ravina 300 for dinner')?.direction).toBe('RECEIVABLE')
    expect(parse('lent Amit 1000')?.direction).toBe('RECEIVABLE')
  })

  it('picks the reason out of "for …"', () => {
    expect(parse('Rahul owes me 250 for the cab')?.reason).toBe('cab')
  })

  it('needs a money verb, not just a name and a number', () => {
    expect(parse('call Rahul at 3')?.intent).not.toBe('expense')
  })
})

describe('spoken control words', () => {
  it.each(['cancel', 'close it', 'exit', 'never mind'])('%s cancels', (text) => {
    expect(isCancelCommand(text, dataset)).toBe(true)
  })

  it.each(['call Rahul', 'cancel my subscription reminder'])('%s does not cancel', (text) => {
    expect(isCancelCommand(text, dataset)).toBe(false)
  })

  it('reads a spoken list of names', () => {
    expect(parseNameList('Rahul and Ravina', dataset)).toEqual(['Rahul', 'Ravina'])
    expect(parseNameList('Rahul, Ravina and Amit', dataset)).toEqual(['Rahul', 'Ravina', 'Amit'])
  })

  it('treats "just me" as nobody else', () => {
    expect(parseNameList('just me', dataset)).toEqual([])
  })

  it('recognises a skipped answer', () => {
    expect(isSkipAnswer('skip', dataset)).toBe(true)
    expect(isSkipAnswer('at 6 pm', dataset)).toBe(false)
  })
})

/*
 * Found while writing this suite. Each is a real defect with a decision behind
 * it, so they are recorded rather than quietly asserted as correct.
 */
describe('known gaps', () => {
  it.todo('a leading colon survives the priority word: "urgent: submit" → ": submit"')

  it.todo('an unused recurrence word stays in a task title: "gym at 6 am daily" → "Gym at daily"')

  it.todo('"next monday" on a Tuesday lands two Mondays away, not the coming one')

  it.todo('"I gave Ravina 300" leaves the name in the title and does not set personName')

  it.todo('"paid 90 for chai yesterday" keeps "yesterday" in the title instead of dating it')
})
