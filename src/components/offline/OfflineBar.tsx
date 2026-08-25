import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useOffline } from '../../hooks/useOffline'
import './OfflineBar.scss'

/**
 * The one place the app admits it is not talking to the server.
 *
 * A queue nobody can see is a queue nobody trusts, so this says whether there
 * is a connection, how much is waiting, and whether anything was refused.
 */
export function OfflineBar() {
  const { online, pending, failed, flush } = useOffline()

  if (online && pending.length === 0 && failed.length === 0) return null

  const waiting = pending.length

  return (
    <div className={`offline-bar ${online ? 'is-syncing' : 'is-offline'} ${failed.length ? 'has-failed' : ''}`}
      role="status" aria-live="polite">
      {!online && <><CloudOff size={15} /> <span>Offline — your changes are saved here and will sync</span></>}

      {online && waiting > 0 && (
        <>
          <RefreshCw size={15} className="spin" />
          <span>Syncing {waiting} change{waiting === 1 ? '' : 's'}</span>
        </>
      )}

      {online && waiting === 0 && failed.length > 0 && (
        <>
          <TriangleAlert size={15} />
          <span>{failed.length} change{failed.length === 1 ? '' : 's'} could not be saved</span>
          <a href="#sync" className="offline-link">Review</a>
        </>
      )}

      {!online && waiting > 0 && <em>{waiting} waiting</em>}
      {online && waiting > 0 && <button type="button" onClick={flush}>Retry now</button>}
    </div>
  )
}
