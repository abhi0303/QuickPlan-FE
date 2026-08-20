import { Check, Clock3, EllipsisVertical } from 'lucide-react'

type TaskPreviewProps = {
  title: string
  time?: string
  tag: string
  color: string
  completed?: boolean
}

export function TaskPreview({ title, time, tag, color, completed }: TaskPreviewProps) {
  return (
    <div className={`task-preview ${completed ? 'completed' : ''}`}>
      <button className="check-circle" aria-label={`Mark "${title}" complete`}>
        <Check size={14} strokeWidth={3.2} />
      </button>

      <div className="task-copy">
        <strong>{title}</strong>
        <div className="task-meta">
          {time && <span className="task-time"><Clock3 size={13} /> {time}</span>}
          <span className="task-tag" style={{ color, backgroundColor: `${color}1f` }}>{tag}</span>
        </div>
      </div>

      <button className="task-menu" aria-label={`More options for "${title}"`}>
        <EllipsisVertical size={17} />
      </button>
    </div>
  )
}
