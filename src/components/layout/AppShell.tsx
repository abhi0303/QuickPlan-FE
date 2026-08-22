import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  AlarmClock,
  CircleCheckBig,
  Flame,
  House,
  LogOut,
  Moon,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Users,
  Wallet,
} from 'lucide-react'
import { Celebration } from '../common/Celebration'
import { NotificationBell } from '../notifications/NotificationBell'
import { QuickAddModal } from '../common/QuickAddModal'
import { EditReminderModal } from '../reminders/EditReminderModal'
import { ReminderAlerts } from '../reminders/ReminderAlerts'
import { EditTaskModal } from '../tasks/EditTaskModal'
import { SpeakButton } from '../common/SpeakButton'
import { useTheme } from '../../hooks/useTheme'
import { useAppStore } from '../../store/useAppStore'
import './AppShell.scss'

/** Voice capture creates tasks and reminders; expenses are made inside a group. */
const VOICE_ROUTES = ['/', '/tasks', '/reminders']

/**
 * Quick Add only makes tasks and reminders, so across the money area the FAB
 * offers that page's own create action instead.
 */
function moneyAction(pathname: string) {
  if (pathname === '/expenses') return 'New group'
  if (pathname.startsWith('/groups/')) return 'Add expense'
  return null
}

const navigation = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/tasks', label: 'Tasks', icon: CircleCheckBig },
  { to: '/reminders', label: 'Reminders', icon: AlarmClock },
  { to: '/expenses', label: 'Money', icon: Wallet },
  { to: '/people', label: 'Friends', icon: Users },
]

export function AppShell() {
  const theme = useTheme()
  const session = useAppStore((state) => state.session)
  const signOut = useAppStore((state) => state.signOut)
  const toggleTheme = useAppStore((state) => state.toggleTheme)
  const setQuickAddOpen = useAppStore((state) => state.setQuickAddOpen)
  const setMoneyComposerOpen = useAppStore((state) => state.setMoneyComposerOpen)
  // both are published by the dashboard; null until it has loaded once
  const activity = useAppStore((state) => state.activity)
  const openToday = useAppStore((state) => state.openToday)
  const { pathname } = useLocation()
  const showVoiceButton = VOICE_ROUTES.includes(pathname)
  const moneyLabel = moneyAction(pathname)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setQuickAddOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setQuickAddOpen])

  const initial = session?.name.charAt(0).toUpperCase() ?? 'Q'
  const firstName = session?.name.split(' ')[0] ?? 'there'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Sparkles size={19} strokeWidth={2.4} /></span>
          <span>Quickplan</span>
        </div>

        <nav className="sidebar-nav">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={19} strokeWidth={2} />
              {label}
              {to === '/tasks' && openToday !== null && openToday > 0 && (
                <span className="nav-badge">{openToday}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* hidden until the dashboard has real completion history: the API
            sends no completion timestamps for some accounts, and a streak is
            not worth inventing */}
        {activity && (
          <div className="streak-card">
            <span className="streak-icon"><Flame size={20} strokeWidth={2.2} /></span>
            <strong>{activity.streak > 0 ? `${activity.streak} day streak` : 'No streak yet'}</strong>
            <small>
              {activity.streak > 0 ? `Keep it going, ${firstName}!` : `Finish one task today, ${firstName}.`}
            </small>
            <div className="streak-dots">
              {activity.days.map((done, index) => (
                <i key={index} className={done ? 'on' : ''} />
              ))}
            </div>
          </div>
        )}

        <div className="user-card">
          <span className="avatar">{initial}</span>
          <div>
            <strong>{session?.name ?? 'Your space'}</strong>
            <small>Personal plan</small>
          </div>
          <button className="sign-out" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="brand topbar-brand">
            <span className="brand-mark sm"><Sparkles size={15} strokeWidth={2.4} /></span>
            <span>Quickplan</span>
          </div>

          {/* Global search is hidden until there is an API to back it: no
              search endpoint exists yet (see docs/push-notifications.md's
              sibling note in the API review). Restore this block once
              GET /api/search lands. */}

          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <NotificationBell />
            <NavLink to="/settings" className="icon-button" aria-label="Settings">
              <Settings size={19} />
            </NavLink>
            <span className="avatar sm" aria-hidden="true">{initial}</span>
          </div>
        </header>

        <div className="page-container">
          <Outlet />
        </div>
      </main>

      {/* with no voice button on this page the FAB takes its lower, easier to
          reach slot rather than floating over the middle of the content */}
      <button
        className={`fab ${showVoiceButton ? '' : 'in-voice-slot'}`}
        aria-label={moneyLabel ?? 'Quick add'}
        title={moneyLabel ?? 'Quick add'}
        onClick={() => (moneyLabel ? setMoneyComposerOpen(true) : setQuickAddOpen(true))}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {showVoiceButton && <SpeakButton floating />}

      <QuickAddModal />
      <EditTaskModal />
      <EditReminderModal />
      <ReminderAlerts />
      <Celebration />

      <nav className="bottom-nav">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
            <Icon size={21} strokeWidth={2} />
            {label}
            <span className="tab-dot" />
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
