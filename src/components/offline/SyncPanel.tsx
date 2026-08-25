import { formatDistanceToNowStrict } from 'date-fns'
import { CircleCheck, CloudOff, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { useOffline } from '../../hooks/useOffline'
import { discard, retry } from '../../services/offline/queue'
import type { QueuedMutation } from '../../services/offline/queue'
import './OfflineBar.scss'

const WHAT: Record<string, string> = {
  'POST:task': 'New task',
  'PATCH:task': 'Task change',
  'DELETE:task': 'Deleted task',
  'POST:reminder': 'New reminder',
  'DELETE:reminder': 'Deleted reminder',
  'POST:expense': 'New expense',
}

function describe(row: QueuedMutation): string {
  const what = WHAT[`${row.method}:${row.entity}`] ?? `${row.entity} change`
  const title = (row.preview as { title?: string } | undefined)?.title
  return title ? `${what} · ${title}` : what
}

/**
 * The outbox, in Settings.
 *
 * Everything queued, why anything failed, and a way to retry or throw it away.
 * Without this, work done offline is invisible until it either appears or
 * quietly does not.
 */
export function SyncPanel() {
  const { online, pending, failed, flush } = useOffline()

  return (
    <div className="sync-panel" id="sync">
      <div className="sync-head">
        <div>
          <strong>{online ? 'Connected' : 'Offline'}</strong>
          <small>
            {pending.length === 0 && failed.length === 0
              ? 'Everything is saved to the server.'
              : `${pending.length} waiting${failed.length ? `, ${failed.length} failed` : ''}`}
          </small>
        </div>

        {online
          ? <button className="setting-action" onClick={flush} disabled={pending.length === 0}>
              <RefreshCw size={14} /> Sync now
            </button>
          : <span className="sync-state"><CloudOff size={14} /> No connection</span>}
      </div>

      {pending.length === 0 && failed.length === 0 && (
        <p className="sync-empty"><CircleCheck size={15} /> Nothing waiting</p>
      )}

      {[...pending, ...failed].map((row) => (
        <div className={`sync-row ${row.failed ? 'is-failed' : ''}`} key={row.id}>
          <div>
            <strong>{describe(row)}</strong>
            <small>
              {row.failed
                ? row.lastError ?? 'The server refused this change'
                : `queued ${formatDistanceToNowStrict(new Date(row.queuedAt), { addSuffix: true })}`}
              {!row.failed && row.attempts > 0 && ` · ${row.attempts} attempt${row.attempts === 1 ? '' : 's'}`}
            </small>
          </div>

          {row.failed ? (
            <div className="sync-actions">
              <button onClick={() => void retry(row.id)} title="Try again"><RefreshCw size={14} /></button>
              <button className="danger" onClick={() => void discard(row.id)} title="Discard"><Trash2 size={14} /></button>
            </div>
          ) : (
            <TriangleAlert size={15} className="sync-waiting" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  )
}
