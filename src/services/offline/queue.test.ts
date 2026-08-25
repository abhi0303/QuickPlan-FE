import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
vi.mock('../api', () => ({ api: { request: (...args: unknown[]) => request(...args) } }))

const { enqueue, flushQueue, isTempId, newTempId, pendingCreates, queueSnapshot, discard, retry } =
  await import('./queue')

/**
 * The outbox has to be right about three things: it must not lose a mutation,
 * it must not send one twice, and it must not send an edit before the create it
 * depends on. Everything here is one of those.
 */

const online = (value: boolean) =>
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })

async function drain() {
  for (const row of queueSnapshot()) await discard(row.id)
}

beforeEach(async () => {
  request.mockReset()
  online(true)
  await drain()
})

describe('temporary ids', () => {
  it('are recognisable, so nothing sends one to the server as real', () => {
    const id = newTempId()
    expect(isTempId(id)).toBe(true)
    expect(isTempId('9f2c1b7e-real')).toBe(false)
  })
})

describe('sending', () => {
  it('sends a queued mutation and clears it', async () => {
    request.mockResolvedValue({ data: { id: 'server-1' } })
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: { title: 'Milk' }, attempts: 0 } as never)

    const result = await flushQueue()

    expect(result.sent).toBe(1)
    expect(queueSnapshot()).toHaveLength(0)
  })

  it('carries an idempotency key, so a lost response cannot duplicate the row', async () => {
    request.mockResolvedValue({ data: { id: 'server-1' } })
    const row = await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: {} } as never)

    await flushQueue()

    expect(request.mock.calls[0][0].headers['Idempotency-Key']).toBe(row.id)
  })

  it('sends oldest first', async () => {
    request.mockResolvedValue({ data: {} })
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: { title: 'first' } } as never)
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: { title: 'second' } } as never)

    await flushQueue()

    expect(request.mock.calls.map((call) => call[0].body ?? call[0].data)).toEqual([
      { title: 'first' }, { title: 'second' },
    ])
  })

  it('does nothing while offline', async () => {
    online(false)
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: {} } as never)

    const result = await flushQueue()

    expect(request).not.toHaveBeenCalled()
    expect(result.left).toBe(1)
  })
})

describe('when a send fails', () => {
  it('keeps a mutation the network could not deliver', async () => {
    request.mockRejectedValue({ message: 'Network Error' })
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: {} } as never)

    await flushQueue()

    expect(queueSnapshot()).toHaveLength(1)
    expect(queueSnapshot()[0].failed).toBeFalsy()
    expect(queueSnapshot()[0].attempts).toBe(1)
  })

  it('stops at the first failure, so an edit cannot overtake its create', async () => {
    request.mockRejectedValueOnce({ message: 'Network Error' }).mockResolvedValue({ data: {} })
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: { title: 'create' } } as never)
    await enqueue({ entity: 'task', method: 'PATCH', url: '/api/tasks/x', body: { title: 'edit' } } as never)

    await flushQueue()

    expect(request).toHaveBeenCalledTimes(1)
    expect(queueSnapshot()).toHaveLength(2)
  })

  it('gives up on a rejection that retrying cannot fix', async () => {
    request.mockRejectedValue({ response: { status: 400, data: { message: 'title should not be empty' } } })
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: {} } as never)

    await flushQueue()

    const [row] = queueSnapshot()
    expect(row.failed).toBe(true)
    expect(row.lastError).toContain('title should not be empty')
  })

  it('keeps retrying a server error', async () => {
    request.mockRejectedValue({ response: { status: 500 } })
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: {} } as never)

    await flushQueue()

    expect(queueSnapshot()[0].failed).toBeFalsy()
  })
})

describe('what the UI shows', () => {
  it('lists queued creates for its entity, and nothing else', async () => {
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', preview: { id: 'tmp_1', title: 'Milk' } } as never)
    await enqueue({ entity: 'task', method: 'DELETE', url: '/api/tasks/9' } as never)
    await enqueue({ entity: 'expense', method: 'POST', url: '/api/groups/1/expenses' } as never)

    expect(pendingCreates('task')).toHaveLength(1)
    expect(pendingCreates('expense')).toHaveLength(1)
    expect(pendingCreates('reminder')).toHaveLength(0)
  })

  it('drops a failed mutation the user discards', async () => {
    const row = await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks' } as never)
    await discard(row.id)
    expect(queueSnapshot()).toHaveLength(0)
  })

  it('puts a failed mutation back in line when retried', async () => {
    request.mockRejectedValue({ response: { status: 400 } })
    const row = await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks' } as never)
    await flushQueue()
    expect(queueSnapshot()[0].failed).toBe(true)

    request.mockResolvedValue({ data: {} })
    await retry(row.id)

    expect(queueSnapshot().find((item) => item.id === row.id)?.failed).toBeFalsy()
  })
})

describe('what the server says, and what the queue does about it', () => {
  it('drops a delete for something already gone rather than failing it', async () => {
    await enqueue({ entity: 'task', method: 'DELETE', url: '/api/tasks/a' })
    request.mockRejectedValueOnce({ response: { status: 404 } })

    await flushQueue()

    expect(queueSnapshot()).toHaveLength(0)
  })

  it('keeps retrying a rate limit instead of treating it as refused', async () => {
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: { title: 'a' } })
    request.mockRejectedValueOnce({ response: { status: 429 } })

    await flushQueue()

    expect(queueSnapshot()[0].failed).toBeFalsy()
    expect(queueSnapshot()[0].attempts).toBe(1)
  })

  it('still refuses to retry a validation error', async () => {
    await enqueue({ entity: 'task', method: 'POST', url: '/api/tasks', body: {} })
    request.mockRejectedValueOnce({ response: { status: 400, data: { message: 'title should not be empty' } } })

    await flushQueue()

    expect(queueSnapshot()[0].failed).toBe(true)
    expect(queueSnapshot()[0].lastError).toBe('title should not be empty')
  })
})
