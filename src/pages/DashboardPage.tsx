import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { format, isSameDay, isToday, isTomorrow, parseISO } from 'date-fns'
import {
  AlarmClock,
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  CircleCheckBig,
  ListChecks,
  IndianRupee,
  Table2,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { QuickAdd } from '../components/common/QuickAdd'
import { downloadFile, toCsv } from '../services/exportFile'
import { MissionsPanel } from '../components/gamification/MissionsPanel'
import { TaskPreview } from '../components/dashboard/TaskPreview'
import { nextOccurrence } from '../components/reminders/reminderTime'
import { useDashboard } from '../hooks/useDashboard'
import { useGamificationView } from '../hooks/useGamification'
import { useUnlocked } from '../hooks/useUnlocked'
import { useGroups } from '../hooks/useGroups'
import { useReminders } from '../hooks/useReminders'
import { useTasks } from '../hooks/useTasks'
import { useAppStore } from '../store/useAppStore'
import './DashboardPage.scss'

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Rough distance, for a glanceable chip rather than a live countdown. */
function inWords(from: Date, to: Date) {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function whenLabel(date: Date) {
  const time = format(date, 'h:mm a')
  if (isToday(date)) return `Today · ${time}`
  if (isTomorrow(date)) return `Tomorrow · ${time}`
  return `${format(date, 'EEEE, d MMM')} · ${time}`
}

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

export function DashboardPage() {
  const session = useAppStore((state) => state.session)
  const setQuickAddOpen = useAppStore((state) => state.setQuickAddOpen)
  const setEditingTask = useAppStore((state) => state.setEditingTask)
  const publishOpenToday = useAppStore((state) => state.publishOpenToday)

  const { tasks, loading, error: loadError, busyId, retry, toggle } = useTasks('today')
  const { upcoming, overdue, loading: weekLoading, error: weekError, retry: retryWeek, stats, oldestOverdueDays } = useDashboard()
  const { reminders, loading: remindersLoading } = useReminders()
  const { groups, loading: groupsLoading } = useGroups()

  const [insightHidden, setInsightHidden] = useState(false)
  const location = useLocation()
  // the shell owns the fetch; this reads what it published
  const game = useGamificationView()
  const canExport = useUnlocked('TASK_CSV')

  const now = new Date()
  const firstName = session?.name.split(' ')[0] ?? 'there'
  const openCount = tasks.filter((task) => !task.isCompleted).length

  // the header chip can ask for the missions panel from another tab; the scroll
  // has to wait until this page has actually rendered it
  const scrollTo = (location.state as { scrollTo?: string } | null)?.scrollTo
  useEffect(() => {
    if (!scrollTo) return
    const frame = requestAnimationFrame(() => {
      document.getElementById(scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [scrollTo])

  // the shell's nav badge is a count this page already has
  useEffect(() => {
    if (loading) return
    publishOpenToday(openCount)
  }, [loading, openCount, publishOpenToday])

  // These are a few array passes over at most a page of items, and every one of
  // them reads the clock — memoising on `now` would either never update or
  // recompute anyway, so they are plain derivations.

  /** Reminders due later today, and how far off the next one is. */
  const dueToday = reminders
    .map((reminder) => nextOccurrence(reminder, now))
    .filter((date): date is Date => date !== null)
    .filter((date) => isSameDay(date, now) && date.getTime() >= now.getTime())
    .sort((a, b) => a.getTime() - b.getTime())
  const reminderToday = { count: dueToday.length, next: dueToday[0] ?? null }

  /** What is still open between you and everyone else, across every group. */
  const settle = (() => {
    const open = groups.filter((group) => Math.abs(group.myNetBalance) >= 0.01)
    const total = open.reduce((sum, group) => sum + Math.abs(group.myNetBalance), 0)
    const owed = open.reduce((sum, group) => sum + Math.max(0, group.myNetBalance), 0)
    return { total, owed, owing: total - owed, groups: open.length }
  })()

  /** The next few things due, tasks and reminders together. */
  const nextUp = (() => {
    const fromTasks = upcoming
      .filter((task) => !task.isCompleted && task.dueDate)
      .map((task) => ({ id: `task-${task.id}`, title: task.title, at: parseISO(task.dueDate as string), kind: 'task' as const }))
    const fromReminders = reminders
      .map((reminder) => ({ id: `rem-${reminder.id}`, title: reminder.title, at: nextOccurrence(reminder, now), kind: 'reminder' as const }))
      .filter((item): item is { id: string, title: string, at: Date, kind: 'reminder' } => item.at !== null)

    return [...fromTasks, ...fromReminders]
      .filter((item) => !Number.isNaN(item.at.getTime()) && item.at.getTime() >= now.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, 4)
  })()

  /** One true sentence about the day — never a guess dressed up as analysis. */
  const insight = (() => {
    if (overdue.length > 0) {
      const days = oldestOverdueDays
      return `${overdue.length} task${overdue.length === 1 ? '' : 's'} past due${
        days && days > 0 ? `, the oldest by ${days} day${days === 1 ? '' : 's'}` : ''
      }. Clearing the oldest first usually unblocks the rest.`
    }
    if (tasks.length > 0 && openCount === 0) return 'Everything planned for today is done. The rest of the day is yours.'
    if (reminderToday.next) return `Your next reminder is in ${inWords(now, reminderToday.next)} — ${format(reminderToday.next, 'h:mm a')}.`
    if (openCount > 0) return `${openCount} thing${openCount === 1 ? '' : 's'} left today and nothing overdue. Good place to be.`
    return 'Nothing overdue and nothing scheduled. Say or type something and it will show up here.'
  })()

  /**
   * Today's list as a spreadsheet, with the day's progress in the file rather
   * than only on screen — the point of exporting is to have the figures
   * somewhere else.
   */
  function exportToday() {
    const done = tasks.filter((task) => task.isCompleted).length
    const rows: (string | number | null | undefined)[][] = [
      ['QuickPlan — tasks for', format(now, 'EEEE d MMMM yyyy')],
      ['Total', tasks.length],
      ['Completed', done],
      ['Remaining', tasks.length - done],
      ['Progress', `${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%`],
      [],
      // a wide datetime shows as ##### at a spreadsheet's default column width,
      // so the day and the clock get a column each
      ['Title', 'Status', 'Priority', 'Category', 'Due date', 'Due time', 'Notes'],
      ...tasks.map((task) => [
        task.title,
        task.isCompleted ? 'Completed' : 'Open',
        task.priority,
        task.category ?? '',
        task.dueDate ? format(parseISO(task.dueDate), 'd MMM yyyy') : '',
        task.dueDate ? format(parseISO(task.dueDate), 'h:mm a') : '',
        task.notes ?? '',
      ]),
    ]
    downloadFile(`quickplan-tasks-${format(now, 'yyyy-MM-dd')}.csv`, toCsv(rows))
    toast.success(`Exported ${tasks.length} task${tasks.length === 1 ? '' : 's'}`)
  }

  return (
    <div className="dashboard">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-date">
            <CalendarDays size={14} />
            {format(now, 'EEEE, d MMMM')}
          </span>
          <h1>{greeting(now.getHours())}, {firstName} 👋</h1>
          <p>
            {loading
              ? 'Loading your day...'
              : openCount > 0
                ? `You have ${openCount} thing${openCount === 1 ? '' : 's'} planned today. One small step at a time.`
                : 'Nothing on your plate today. Add something to get started.'}
          </p>
        </div>
        <div className="hero-actions">
          <QuickAdd label="Quick add" />
        </div>
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-icon"><CircleCheckBig size={22} /></span>
            {stats.trend !== null && (
              <span className={`stat-trend ${stats.trend < 0 ? 'down' : ''}`}>
                {stats.trend < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                {Math.abs(stats.trend)}%
              </span>
            )}
          </div>
          <strong>{weekLoading ? '—' : stats.doneThisWeek}</strong>
          {/* without completion timestamps the API cannot say when these were
              finished, so the card says what it actually knows */}
          <span className="stat-label">{stats.dated ? 'Tasks done this week' : 'Tasks completed'}</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-icon periwinkle"><AlarmClock size={22} /></span>
            <span className="stat-trend neutral">
              {reminderToday.next ? `Next in ${inWords(now, reminderToday.next)}` : 'Nothing left'}
            </span>
          </div>
          <strong>{remindersLoading ? '—' : reminderToday.count}</strong>
          <span className="stat-label">Reminders left today</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-icon tangerine"><IndianRupee size={22} /></span>
            <span className="stat-trend neutral">
              {settle.groups === 0 ? 'All settled' : `${settle.groups} group${settle.groups === 1 ? '' : 's'}`}
            </span>
          </div>
          <strong>{groupsLoading ? '—' : money(settle.total)}</strong>
          <span className="stat-label">
            {settle.total === 0 ? 'Money to settle'
              : settle.owing === 0 ? 'Owed to you'
                : settle.owed === 0 ? 'You owe' : 'Money to settle'}
          </span>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Today {!loading && <span className="count-pill">{openCount}</span>}</h2>
            <div className="panel-head-side">
              {canExport && tasks.length > 0 && (
                <button className="text-button" onClick={exportToday} title="Download today as CSV">
                  <Table2 size={15} /> Export
                </button>
              )}
              <Link to="/tasks" className="text-button">View all <ArrowUpRight size={15} /></Link>
            </div>
          </div>
          <p className="muted">
            {format(now, 'EEEE, d MMMM')}
            {!loading && tasks.length > 0 && (
              <> · {tasks.length - openCount} of {tasks.length} done</>
            )}
          </p>

          {loading && (
            <div className="task-list">
              {[0, 1, 2].map((row) => <div className="task-skeleton" key={row} />)}
            </div>
          )}

          {!loading && loadError && (
            <div className="panel-state">
              <CircleAlert size={20} />
              <p>{loadError}</p>
              <button className="text-button" onClick={retry}>Try again</button>
            </div>
          )}

          {!loading && !loadError && tasks.length === 0 && (
            <div className="panel-state">
              <ListChecks size={22} />
              <p>Nothing scheduled for today yet.</p>
            </div>
          )}

          {!loading && !loadError && tasks.length > 0 && (
            <div className="task-list">
              {tasks.map((task) => (
                <TaskPreview key={task.id} task={task} onToggle={toggle} onEdit={setEditingTask} busy={busyId === task.id} />
              ))}
            </div>
          )}

          <button className="add-task-line" onClick={() => setQuickAddOpen(true)}>
            <Plus size={17} /> Add a task
          </button>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Upcoming</h2>
            <Link to="/reminders" className="text-button">Reminders <ArrowUpRight size={15} /></Link>
          </div>
          <p className="muted">Your next few days</p>

          {(weekLoading || remindersLoading) && (
            <div className="task-list">
              {[0, 1, 2].map((row) => <div className="task-skeleton" key={row} />)}
            </div>
          )}

          {!weekLoading && weekError && (
            <div className="panel-state">
              <CircleAlert size={20} />
              <p>{weekError}</p>
              <button className="text-button" onClick={retryWeek}>Try again</button>
            </div>
          )}

          {!weekLoading && !remindersLoading && !weekError && nextUp.length === 0 && (
            <div className="panel-state">
              <CalendarDays size={22} />
              <p>Nothing on the horizon.</p>
            </div>
          )}

          {!weekLoading && !remindersLoading && !weekError && nextUp.length > 0 && (
            <div className="upcoming-list">
              {nextUp.map((item) => (
                <div className="upcoming-item" key={item.id}>
                  <time>{format(item.at, 'EEE')}<strong>{format(item.at, 'd')}</strong></time>
                  <p>
                    <strong>{item.title}</strong>
                    <small>
                      {item.kind === 'reminder' && <AlarmClock size={11} />}
                      {whenLabel(item.at)}
                    </small>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <MissionsPanel
        state={game.state}
        catalogue={game.catalogue}
        loading={game.loading}
        error={game.error}
        onRetry={game.refresh}
        onExpire={game.refresh}
      />

      {!insightHidden && (
        <section className="insight-card">
          <span className="insight-icon"><Sparkles size={22} /></span>
          <div>
            <strong>Quickplan insight</strong>
            <p>{insight}</p>
          </div>
          <button className="dismiss-button" aria-label="Dismiss insight" onClick={() => setInsightHidden(true)}>
            <X size={18} />
          </button>
        </section>
      )}
    </div>
  )
}
