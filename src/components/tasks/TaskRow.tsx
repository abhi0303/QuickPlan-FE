import { useEffect, useRef, useState } from 'react'
import { format, isPast, isToday, isTomorrow, parseISO } from 'date-fns'
import { Check, Clock3, Pencil, Trash2 } from 'lucide-react'
import type { Task, TaskPriority } from '../../services/tasks'
import { isTempId } from '../../services/offline/queue'
import './TaskRow.scss'

const CATEGORY_COLORS: Record<string, string> = {
  work: '#6c7bff',
  personal: '#f2871f',
  finance: '#0fb58a',
  health: '#e0526d',
}

const DEFAULT_COLOR = '#6e8a80'

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
}

/** "Today, 5:00 PM" / "Tomorrow, 9:30 AM" / "21 Aug, 10:00 AM" */
function describeDue(dueDate?: string) {
  if (!dueDate) return null
  let parsed: Date
  try {
    parsed = parseISO(dueDate)
  } catch {
    return null
  }
  if (Number.isNaN(parsed.getTime())) return null

  const time = format(parsed, 'h:mm a')
  if (isToday(parsed)) return { label: `Today, ${time}`, overdue: isPast(parsed) }
  if (isTomorrow(parsed)) return { label: `Tomorrow, ${time}`, overdue: false }
  return { label: `${format(parsed, 'd MMM')}, ${time}`, overdue: isPast(parsed) }
}

type Props = {
  task: Task
  busy?: boolean
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
  onEdit: (task: Task) => void
}

export function TaskRow({ task, busy, onToggle, onDelete, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false)
  /* Whether the note is actually being cut off. Measured rather than assumed,
     because it depends on the width the row happens to have — and the layout
     changes shape at 1000px, so the answer changes with the window. */
  const [clipped, setClipped] = useState(false)
  const noteRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const note = noteRef.current
    // an opened note reports no overflow, which would take its own toggle away
    if (!note || expanded) return

    const observer = new ResizeObserver(() => {
      setClipped(note.scrollWidth > note.clientWidth + 1)
    })
    observer.observe(note)
    return () => observer.disconnect()
  }, [expanded])

  const due = describeDue(task.dueDate)
  const color = task.category ? CATEGORY_COLORS[task.category.toLowerCase()] ?? DEFAULT_COLOR : DEFAULT_COLOR

  return (
    <div className={`task-row ${task.isCompleted ? 'completed' : ''} ${busy ? 'is-busy' : ''} ${isTempId(task.id) ? 'is-queued' : ''}`}>
      <button
        className="check-circle"
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-pressed={task.isCompleted}
        aria-label={`Mark "${task.title}" ${task.isCompleted ? 'incomplete' : 'complete'}`}
      >
        <Check size={14} strokeWidth={3.2} />
      </button>

      <div className="task-row-copy">
        <div>
          <strong>{task.title}</strong>
          {task.notes && (
            <button
              type="button"
              ref={noteRef}
              className={`task-notes ${expanded ? 'is-open' : ''}`}
              /* nothing to open when it already fits, and a control that does
                 nothing should not be reachable by keyboard either */
              disabled={!clipped && !expanded}
              aria-expanded={clipped || expanded ? expanded : undefined}
              onClick={() => setExpanded((open) => !open)}
              title={!expanded && clipped ? 'Show the whole note' : undefined}
            >
              {task.notes}
            </button>
          )}
        </div>

        <div className="task-meta">
          {due && (
            <span className={`task-time ${due.overdue && !task.isCompleted ? 'overdue' : ''}`}>
              <Clock3 size={13} /> {due.label}
            </span>
          )}
          {task.category && (
            <span className="task-tag" style={{ color, backgroundColor: `${color}1f` }}>{task.category}</span>
          )}
          <span className={`priority-tag ${PRIORITY_CLASS[task.priority]}`}>{task.priority.toLowerCase()}</span>
        </div>
      </div>

      <div className="task-row-actions">
        <button
          className="task-edit"
          onClick={() => onEdit(task)}
          disabled={busy}
          aria-label={`Edit "${task.title}"`}
        >
          <Pencil size={16} />
        </button>

        <button
          className="task-delete"
          onClick={() => onDelete(task)}
          disabled={busy}
          aria-label={`Delete "${task.title}"`}
        >
          <Trash2 size={17} />
        </button>
      </div>
    </div>
  )
}
