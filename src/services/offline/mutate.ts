import { enqueue, newTempId } from './queue'
import type { QueuedEntity } from './queue'

/**
 * One entry point for every write that should survive a bad connection.
 *
 * The request is attempted immediately. If the network refuses it — offline, a
 * timeout, a server that is asleep — the mutation is queued and the caller is
 * handed an optimistic result so the UI can move on. Anything the server
 * actively rejected is thrown, because a validation error is not a connection
 * problem and pretending it succeeded would be a lie.
 */
export function isOffline(error: unknown): boolean {
  const failure = error as { response?: unknown, code?: string }
  // axios sets no response when the request never reached the server
  return !failure.response
}

type SendOptions<T> = {
  entity: QueuedEntity
  method: 'POST' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
  /** What to show while it is pending — for a create, the row itself. */
  optimistic?: (tempId: string) => T
  send: () => Promise<T>
}

export type Sent<T> = { data: T, queued: boolean }

export async function sendOrQueue<T>({ entity, method, url, body, optimistic, send }: SendOptions<T>): Promise<Sent<T>> {
  try {
    return { data: await send(), queued: false }
  } catch (error) {
    if (!isOffline(error)) throw error

    const tempId = optimistic ? newTempId() : undefined
    const data = optimistic?.(tempId as string)

    await enqueue({
      entity,
      method,
      url,
      body,
      tempId,
      preview: data as Record<string, unknown> | undefined,
    })

    return { data: data as T, queued: true }
  }
}
