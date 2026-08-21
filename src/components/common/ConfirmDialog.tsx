import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import './ConfirmDialog.scss'

type Props = {
  open: boolean
  title: string
  /** What exactly is about to happen — name the item, do not just say "this". */
  message: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation for destructive actions.
 *
 * Portalled and focused on Cancel, so the safe option is the one a stray Enter
 * or Space lands on.
 */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', busy, onConfirm, onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="confirm-icon"><TriangleAlert size={22} /></span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>

        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" ref={cancelRef} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="confirm-danger" onClick={onConfirm} disabled={busy}>
            {busy ? <><LoaderCircle size={16} className="spin" /> Deleting...</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
