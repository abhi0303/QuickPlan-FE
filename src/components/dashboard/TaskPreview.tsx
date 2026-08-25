import { format, parseISO } from 'date-fns'
import { Check, Clock3, Pencil } from 'lucide-react'
import type { Task } from '../../services/tasks'
import { isTempId } from '../../services/offline/queue'
import './TaskPreview.scss'

const CATEGORY_COLORS: Record<string, string> = {
  work: '#6c7bff',
  personal: '#f2871f',
  finance: '#0fb58a',
  health: '#e0526d',
}

const DEFAULT_COLOR = '#6e8a80'

function formatDue(dueDate?: string) {
  if (!dueDate) return undefined
  try {
    return format(parseISO(dueDate), 'h:mm a')
  } catch {
    return undefined
  }
}

type Props = {
  task: Task
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
  busy?: boolean
}

export function TaskPreview({ task, onToggle, onEdit, busy }: Props) {
  const time = formatDue(task.dueDate)
  const color = task.category ? CATEGORY_COLORS[task.category.toLowerCase()] ?? DEFAULT_COLOR : DEFAULT_COLOR

  return (
    <div className={`task-preview ${task.isCompleted ? 'completed' : ''} ${isTempId(task.id) ? 'is-queued' : ''}`}>
      <button
        className="check-circle"
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-pressed={task.isCompleted}
        aria-label={`Mark "${task.title}" ${task.isCompleted ? 'incomplete' : 'complete'}`}
      >
        <Check size={14} strokeWidth={3.2} />
      </button>

      <div className="task-copy">
        <strong>{task.title}</strong>
        {(time || task.category) && (
          <div className="task-meta">
            {time && <span className="task-time"><Clock3 size={13} /> {time}</span>}
            {task.category && (
              <span className="task-tag" style={{ color, backgroundColor: `${color}1f` }}>{task.category}</span>
            )}
          </div>
        )}
      </div>

      <button className="task-menu" onClick={() => onEdit(task)} disabled={busy}
        aria-label={`Edit "${task.title}"`}>
        <Pencil size={16} />
      </button>
    </div>
  )
}
