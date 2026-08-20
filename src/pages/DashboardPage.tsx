import { format } from 'date-fns'
import {
  AlarmClock,
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  CircleCheckBig,
  ListChecks,
  IndianRupee,
  Plus,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import { QuickAdd } from '../components/common/QuickAdd'
import { TaskPreview } from '../components/dashboard/TaskPreview'
import { useTasks } from '../hooks/useTasks'
import { useAppStore } from '../store/useAppStore'

const upcoming = [
  { day: 'Fri', date: '21', title: 'Send client proposal', when: 'Tomorrow · 10:00 AM' },
  { day: 'Sat', date: '22', title: 'Team offsite', when: 'Saturday · All day' },
  { day: 'Mon', date: '25', title: 'Rent payment', when: 'Monday · 9:00 AM' },
]

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const session = useAppStore((state) => state.session)
  const setQuickAddOpen = useAppStore((state) => state.setQuickAddOpen)
  const { tasks, loading, error: loadError, busyId, retry, toggle } = useTasks('today')

  const now = new Date()
  const firstName = session?.name.split(' ')[0] ?? 'there'

  const openCount = tasks.filter((task) => !task.isCompleted).length

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
          <QuickAdd label="Speak it" variant="ghost" icon="mic" />
        </div>
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-icon"><CircleCheckBig size={22} /></span>
            <span className="stat-trend"><TrendingUp size={13} /> 18%</span>
          </div>
          <strong>12</strong>
          <span className="stat-label">Tasks done this week</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-icon periwinkle"><AlarmClock size={22} /></span>
            <span className="stat-trend neutral">Next in 2h</span>
          </div>
          <strong>4</strong>
          <span className="stat-label">Reminders today</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-icon tangerine"><IndianRupee size={22} /></span>
            <span className="stat-trend neutral">3 people</span>
          </div>
          <strong>₹2,450</strong>
          <span className="stat-label">Money to settle</span>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Today {!loading && <span className="count-pill">{openCount}</span>}</h2>
            <button className="text-button">View all <ArrowUpRight size={15} /></button>
          </div>
          <p className="muted">{format(now, 'EEEE, d MMMM')}</p>

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
                <TaskPreview key={task.id} task={task} onToggle={toggle} busy={busyId === task.id} />
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
            <button className="text-button">Calendar <ArrowUpRight size={15} /></button>
          </div>
          <p className="muted">Your next few days</p>

          <div className="upcoming-list">
            {upcoming.map((item) => (
              <div className="upcoming-item" key={item.title}>
                <time>{item.day}<strong>{item.date}</strong></time>
                <p>
                  <strong>{item.title}</strong>
                  <small>{item.when}</small>
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="insight-card">
        <span className="insight-icon"><Sparkles size={22} /></span>
        <div>
          <strong>Quickplan insight</strong>
          <p>Your afternoon looks lighter than usual — a good window to finish that quarterly report.</p>
        </div>
        <button className="dismiss-button" aria-label="Dismiss insight"><X size={18} /></button>
      </section>
    </div>
  )
}
