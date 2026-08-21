import { CircleAlert, ListChecks, Plus } from 'lucide-react'
import { TaskRow } from '../components/tasks/TaskRow'
import { useTasks } from '../hooks/useTasks'
import type { TaskView } from '../services/tasks'
import { useAppStore } from '../store/useAppStore'

const FILTERS: { label: string; value?: TaskView }[] = [
  { label: 'All', value: undefined },
  { label: 'Today', value: 'today' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Completed', value: 'completed' },
]

const EMPTY_COPY: Record<string, string> = {
  all: 'No tasks yet. Add your first one to get started.',
  today: 'Nothing scheduled for today.',
  upcoming: 'Nothing coming up. Enjoy the quiet.',
  overdue: 'Nothing overdue — you are all caught up.',
  completed: 'No completed tasks yet.',
}

export function TasksPage() {
  const { view, setView, tasks, loading, error, busyId, retry, toggle, remove } = useTasks()
  const setQuickAddOpen = useAppStore((state) => state.setQuickAddOpen)

  const openCount = tasks.filter((task) => !task.isCompleted).length

  return (
    <section className="tasks-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Your work</p>
          <h1>Tasks</h1>
          <p className="muted">Plan, prioritize, and complete everything that matters.</p>
        </div>
        <button className="quick-add solid" onClick={() => setQuickAddOpen(true)}>
          <Plus size={18} strokeWidth={2.4} /> New task
        </button>
      </div>

      <div className="filter-bar" role="tablist" aria-label="Filter tasks">
        {FILTERS.map((filter) => (
          <button
            key={filter.label}
            role="tab"
            aria-selected={view === filter.value}
            className={view === filter.value ? 'active' : ''}
            onClick={() => setView(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="panel">
        {loading && (
          <div className="task-list">
            {[0, 1, 2, 3].map((row) => <div className="task-skeleton tall" key={row} />)}
          </div>
        )}

        {!loading && error && (
          <div className="panel-state">
            <CircleAlert size={22} />
            <p>{error}</p>
            <button className="text-button" onClick={retry}>Try again</button>
          </div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="panel-state">
            <ListChecks size={26} />
            <p>{EMPTY_COPY[view ?? 'all']}</p>
            <button className="text-button" onClick={() => setQuickAddOpen(true)}>Add a task</button>
          </div>
        )}

        {!loading && !error && tasks.length > 0 && (
          <>
            <p className="list-summary">
              {tasks.length} task{tasks.length === 1 ? '' : 's'}
              {openCount !== tasks.length && ` · ${openCount} open`}
            </p>
            <div className="task-list">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  busy={busyId === task.id}
                  onToggle={toggle}
                  onDelete={remove}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
