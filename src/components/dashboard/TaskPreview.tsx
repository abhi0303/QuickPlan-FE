type TaskPreviewProps = { title: string; time?: string; tag: string; color: string; completed?: boolean }

export function TaskPreview({ title, time, tag, color, completed }: TaskPreviewProps) {
  return <div className={`task-preview ${completed ? 'completed' : ''}`}><button className="check-circle" aria-label={`Mark ${title} complete`} /> <div className="task-copy"><strong>{title}</strong><div>{time && <span className="task-time">◷ {time}</span>}<span className="task-tag" style={{ color, backgroundColor: `${color}18` }}>{tag}</span></div></div><span className="task-menu">•••</span></div>
}
