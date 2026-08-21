import { format, isPast, isToday, isTomorrow, parseISO } from 'date-fns'
import { Check, Clock3, Trash2 } from 'lucide-react'
import type { Task, TaskPriority } from '../../services/tasks'

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
}

export function TaskRow({ task, busy, onToggle, onDelete }: Props) {
  const due = describeDue(task.dueDate)
  const color = task.category ? CATEGORY_COLORS[task.category.toLowerCase()] ?? DEFAULT_COLOR : DEFAULT_COLOR

  return (
    <div className={`task-row ${task.isCompleted ? 'completed' : ''} ${busy ? 'is-busy' : ''}`}>
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
        <strong>{task.title}</strong>
        {task.notes && <p className="task-notes">{task.notes}</p>}

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

      <button
        className="task-delete"
        onClick={() => onDelete(task)}
        disabled={busy}
        aria-label={`Delete "${task.title}"`}
      >
        <Trash2 size={17} />
      </button>
    </div>
  )
}
