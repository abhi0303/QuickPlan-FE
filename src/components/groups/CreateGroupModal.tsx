import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { CircleAlert, LoaderCircle, Plus, Users, X } from 'lucide-react'
import { MultiSelect } from '../common/MultiSelect'
import { getApiErrorMessage } from '../../services/api'
import { listFriends } from '../../services/friends'
import type { Friend } from '../../services/friends'
import type { CreateGroupPayload } from '../../services/groups'
import './CreateGroupModal.scss'

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (payload: CreateGroupPayload) => Promise<unknown>
}

export function CreateGroupModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    nameRef.current?.focus()
    // only friends can be added, so the picker is the friend list
    listFriends().then(setFriends).catch(() => setFriends([]))

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the group a name.')
      nameRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      await onCreate({
        name: trimmed,
        description: description.trim() || undefined,
        memberIds: selected.length ? selected : undefined,
      })
      toast.success(`${trimmed} created`)
      setName(''); setDescription(''); setSelected([])
      onClose()
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not create that group.'))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal group-modal" role="dialog" aria-modal="true" aria-labelledby="create-group-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="create-group-title">New group</h2>
            <p className="muted">Everyone in the group sees the same expenses and balances.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="group-name">Name</label>
            <input id="group-name" className="control" ref={nameRef} value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="Goa Trip" disabled={saving} autoComplete="off" />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="group-desc">
              Description <span className="field-optional">optional</span>
            </label>
            <input id="group-desc" className="control" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dec weekend" disabled={saving} autoComplete="off" />
          </div>

          <div className="field">
            <span className="field-label">
              <Users size={14} /> Members
              {selected.length > 0 && <span className="field-optional">{selected.length} selected</span>}
            </span>

            {friends.length === 0 ? (
              <p className="field-hint">
                You have no friends yet — add some on the Friends page, then you can put them in a
                group. You can also create the group now and add people later.
              </p>
            ) : (
              <MultiSelect
                options={friends.map((friend) => ({ id: friend.id, label: friend.name, sublabel: friend.email }))}
                selected={selected}
                onChange={setSelected}
                placeholder="Search and pick friends"
                searchPlaceholder="Search friends..."
                disabled={saving}
                label="Members"
              />
            )}
          </div>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="modal-submit" disabled={saving}>
              {saving ? <><LoaderCircle size={18} className="spin" /> Creating...</> : <><Plus size={18} /> Create group</>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
