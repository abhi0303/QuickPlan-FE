import { useState } from 'react'
import { CircleAlert, Flag, ListChecks, Plus, Search, SlidersHorizontal, Tag, X } from 'lucide-react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { ScrollRow } from '../components/common/ScrollRow'
import { TaskRow } from '../components/tasks/TaskRow'
import { groupTasks, searchTasks, SORT_OPTIONS } from '../components/tasks/taskGrouping'
import type { SortKey } from '../components/tasks/taskGrouping'
import { useTasks } from '../hooks/useTasks'
import { TASK_PRIORITIES } from '../services/tasks'
import type { TaskView } from '../services/tasks'
import { useAppStore } from '../store/useAppStore'
import './TasksPage.scss'

const FILTERS: { label: string; value?: TaskView }[] = [
  { label: 'All', value: undefined },
  { label: 'Today', value: 'today' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Completed', value: 'completed' },
]

/** Sent as ?category= — server-side, same as the view tabs. */
const CATEGORY_OPTIONS = ['Work', 'Personal', 'Finance', 'Health']

const EMPTY_COPY: Record<string, string> = {
  all: 'No tasks yet. Add your first one to get started.',
  today: 'Nothing scheduled for today.',
  upcoming: 'Nothing coming up. Enjoy the quiet.',
  overdue: 'Nothing overdue — you are all caught up.',
  completed: 'No completed tasks yet.',
}

export function TasksPage() {
  const { filters, view, setView, setFilter, tasks, loading, error, busyId, retry, toggle, remove } = useTasks()
  const setQuickAddOpen = useAppStore((state) => state.setQuickAddOpen)
  const setEditingTask = useAppStore((state) => state.setEditingTask)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('due')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)

  const now = new Date()
  const visible = searchTasks(tasks, query)
  const groups = groupTasks(visible, now, sort)

  const hasExtraFilters = Boolean(filters.category || filters.priority)

  function clearFilters() {
    setFilter('category', undefined)
    setFilter('priority', undefined)
  }

  const doneCount = tasks.filter((task) => task.isCompleted).length
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

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

      {/* progress reads at a glance without opening anything */}
      {!loading && !error && tasks.length > 0 && (
        <div className="task-progress">
          <div className="task-progress-top">
            <strong>{doneCount} of {tasks.length} done</strong>
            <span>{progress}%</span>
          </div>
          <div className="task-progress-bar"><i style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <div className="tasks-toolbar">
        {/* row 1: the view tabs, with search kept to a fixed width so it can
            never squeeze the tabs off screen */}
        <div className="toolbar-row">
          <ScrollRow className="filter-bar" role="tablist" label="Filter tasks">
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
          </ScrollRow>

          <label className="search-inline">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter tasks..."
              aria-label="Filter tasks by name"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear filter"><X size={14} /></button>
            )}
          </label>
        </div>

        {/* row 2: refinements */}
        <div className="toolbar-row">
          <ScrollRow className="select-row">
            <label className="sort-select">
              <Tag size={15} />
              <select
                value={filters.category ?? ''}
                onChange={(event) => setFilter('category', event.target.value || undefined)}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>

            <label className="sort-select">
              <Flag size={15} />
              <select
                value={filters.priority ?? ''}
                onChange={(event) => setFilter('priority', event.target.value || undefined)}
                aria-label="Filter by priority"
              >
                <option value="">Any priority</option>
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority.charAt(0) + priority.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="sort-select">
              <SlidersHorizontal size={15} />
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort tasks">
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {hasExtraFilters && (
              <button type="button" className="chip clear" onClick={clearFilters}>
                <X size={13} /> Clear
              </button>
            )}
          </ScrollRow>
        </div>
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
            <p>{hasExtraFilters ? 'No tasks match these filters.' : EMPTY_COPY[view ?? 'all']}</p>
            {hasExtraFilters
              ? <button className="text-button" onClick={clearFilters}>Clear filters</button>
              : <button className="text-button" onClick={() => setQuickAddOpen(true)}>Add a task</button>}
          </div>
        )}

        {!loading && !error && tasks.length > 0 && visible.length === 0 && (
          <div className="panel-state">
            <Search size={22} />
            <p>Nothing matches “{query}”.</p>
            <button className="text-button" onClick={() => setQuery('')}>Clear filter</button>
          </div>
        )}

        {!loading && !error && groups.map((group) => (
          <div className="task-group" key={group.bucket}>
            <div className={`task-group-head ${group.bucket}`}>
              <span>{group.label}</span>
              <i>{group.tasks.length}</i>
            </div>
            <div className="task-list">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  busy={busyId === task.id}
                  onToggle={toggle}
                  onDelete={(item) => setPendingDelete({ id: item.id, title: item.title })}
                  onEdit={setEditingTask}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        busy={busyId === pendingDelete?.id}
        title="Delete this task?"
        message={`"${pendingDelete?.title ?? ''}" will be permanently removed.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const target = tasks.find((item) => item.id === pendingDelete?.id)
          if (target) await remove(target)
          setPendingDelete(null)
        }}
      />
    </section>
  )
}
