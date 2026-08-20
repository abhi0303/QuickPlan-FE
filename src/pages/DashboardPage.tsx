import { format } from 'date-fns'
import {
  AlarmClock,
  ArrowUpRight,
  CalendarDays,
  CircleCheckBig,
  IndianRupee,
  Plus,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import { QuickAdd } from '../components/common/QuickAdd'
import { TaskPreview } from '../components/dashboard/TaskPreview'
import { useAppStore } from '../store/useAppStore'

const CATEGORY = {
  work: '#6c7bff',
  personal: '#f2871f',
  finance: '#0fb58a',
}

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
  const now = new Date()
  const firstName = session?.name.split(' ')[0] ?? 'there'

  return (
    <div className="dashboard">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-date">
            <CalendarDays size={14} />
            {format(now, 'EEEE, d MMMM')}
          </span>
          <h1>{greeting(now.getHours())}, {firstName} 👋</h1>
          <p>You have 4 things planned today. Make it count, one small step at a time.</p>
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
            <h2>Today <span className="count-pill">4</span></h2>
            <button className="text-button">View all <ArrowUpRight size={15} /></button>
          </div>
          <p className="muted">{format(now, 'EEEE, d MMMM')}</p>

          <div className="task-list">
            <TaskPreview title="Call Rahul about the project" time="5:00 PM" tag="Work" color={CATEGORY.work} />
            <TaskPreview title="Finish the quarterly report" tag="Work" color={CATEGORY.work} />
            <TaskPreview title="Pick up groceries" time="7:30 PM" tag="Personal" color={CATEGORY.personal} />
            <TaskPreview title="Pay electricity bill" tag="Finance" color={CATEGORY.finance} completed />
          </div>

          <button className="add-task-line"><Plus size={17} /> Add a task</button>
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
