import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, CircleAlert, LoaderCircle, Plus, QrCode, Star, Trash2, X } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { fetchProfile, saveUpiIds } from '../../services/auth'
import { isValidUpiId, normalizeUpiId } from '../../services/upi'
import './UpiRow.scss'

/** The API's own limit. Reached, the add control says so rather than failing. */
const MAX_UPI_IDS = 5

/**
 * The UPI addresses people can pay you at.
 *
 * More than one because most people have more than one — a bank handle and a
 * payment app's — and which one works can depend on who is paying. Order is
 * the whole of "default": the first is what the pay screen offers before
 * anybody chooses, so making one the default is moving it to the front rather
 * than setting a flag beside it.
 *
 * They are shown to anyone who shares a group with you, which is the point of
 * saving them, so they are only ever entered here by their owner.
 */
export function UpiRow() {
  const [list, setList] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    fetchProfile()
      .then((profile) => {
        if (!live) return
        setList(profile.upiIds ?? [])
        setLoading(false)
      })
      .catch(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  /** The list is only ever replaced wholesale, so order survives every edit. */
  async function commit(next: string[], done: string) {
    setBusy(true)
    setError('')
    try {
      await saveUpiIds(next)
      setList(next)
      setAdding(false)
      setDraft('')
      toast.success(done)
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Could not save that right now. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  function handleAdd() {
    const next = normalizeUpiId(draft)
    if (!isValidUpiId(next)) return setError('A UPI ID reads like name@bank.')
    /* Lower-cased before comparing, because VPAs are case-insensitive and the
       API de-duplicates the same way — Abhi@ybl and abhi@ybl are one account. */
    if (list.includes(next)) return setError('That one is already on the list.')
    if (list.length >= MAX_UPI_IDS) return setError(`Five is the most you can save.`)
    void commit([...list, next], list.length === 0 ? 'UPI ID saved.' : 'UPI ID added.')
  }

  function makeDefault(upiId: string) {
    void commit([upiId, ...list.filter((entry) => entry !== upiId)], 'Default UPI ID changed.')
  }

  function remove(upiId: string) {
    void commit(list.filter((entry) => entry !== upiId), 'UPI ID removed.')
  }

  return (
    <div className="setting-row is-stacked">
      <div className="setting-label">
        <span className="setting-icon"><QrCode size={20} /></span>
        <div>
          <strong>Your UPI IDs</strong>
          <small>
            {loading
              ? 'Checking...'
              : list.length === 0
                ? 'Save one so people can pay you back in a tap'
                : 'Offered to anyone in your groups who owes you — the first one by default'}
          </small>
        </div>
      </div>

      {!loading && (
        <div className="upi-list">
          {list.map((upiId, index) => (
            <div className={`upi-item ${index === 0 ? 'is-default' : ''}`} key={upiId}>
              <code className="upi-value" title={upiId}>{upiId}</code>

              {index === 0
                ? <span className="upi-flag"><Star size={11} /> Default</span>
                : (
                  <button className="upi-mini" onClick={() => makeDefault(upiId)} disabled={busy}>
                    Make default
                  </button>
                )}

              <button className="upi-mini is-icon" onClick={() => remove(upiId)} disabled={busy}
                aria-label={`Remove ${upiId}`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {adding ? (
            <div className="upi-add">
              <input
                className="control" inputMode="email" autoComplete="off" spellCheck={false} autoFocus
                placeholder="name@bank" value={draft} disabled={busy}
                onChange={(event) => { setDraft(event.target.value); setError('') }}
                onKeyDown={(event) => { if (event.key === 'Enter') handleAdd() }}
              />
              <button className="setting-action" onClick={handleAdd} disabled={busy}>
                {busy ? <><LoaderCircle size={14} className="spin" /> Saving</> : <><Check size={14} /> Save</>}
              </button>
              <button className="setting-action is-quiet" onClick={() => { setAdding(false); setError('') }}
                disabled={busy} aria-label="Cancel">
                <X size={14} />
              </button>
            </div>
          ) : list.length < MAX_UPI_IDS ? (
            <button className="setting-action" onClick={() => setAdding(true)} disabled={busy}>
              <Plus size={14} /> {list.length === 0 ? 'Add a UPI ID' : 'Add another'}
            </button>
          ) : (
            <p className="field-hint">Five is the most you can save. Remove one to add another.</p>
          )}

          {error && <p className="field-hint is-warn"><CircleAlert size={13} /> {error}</p>}
        </div>
      )}
    </div>
  )
}
