import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  AlarmClock,
  Bell,
  CircleCheckBig,
  Flame,
  House,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Users,
  Wallet,
} from 'lucide-react'
import { QuickAddModal } from '../common/QuickAddModal'
import { useTheme } from '../../hooks/useTheme'
import { useAppStore } from '../../store/useAppStore'

const navigation = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/tasks', label: 'Tasks', icon: CircleCheckBig, badge: '4' },
  { to: '/reminders', label: 'Reminders', icon: AlarmClock },
  { to: '/expenses', label: 'Money', icon: Wallet },
  { to: '/people', label: 'People', icon: Users },
]

export function AppShell() {
  const theme = useTheme()
  const session = useAppStore((state) => state.session)
  const signOut = useAppStore((state) => state.signOut)
  const toggleTheme = useAppStore((state) => state.toggleTheme)
  const setQuickAddOpen = useAppStore((state) => state.setQuickAddOpen)

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
          {navigation.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={19} strokeWidth={2} />
              {label}
              {badge && <span className="nav-badge">{badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="streak-card">
          <span className="streak-icon"><Flame size={20} strokeWidth={2.2} /></span>
          <strong>5 day streak</strong>
          <small>Keep it going, {firstName}!</small>
          <div className="streak-dots">
            {[true, true, true, true, true, false, false].map((done, index) => (
              <i key={index} className={done ? 'on' : ''} />
            ))}
          </div>
        </div>

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

          <label className="search-pill">
            <Search size={18} />
            <input placeholder="Search tasks, people, money..." aria-label="Search" />
            <kbd>⌘K</kbd>
          </label>

          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={19} />
              <i className="dot" />
            </button>
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

      <button className="fab" aria-label="Quick add" onClick={() => setQuickAddOpen(true)}>
        <Plus size={26} strokeWidth={2.5} />
      </button>

      <QuickAddModal />

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
