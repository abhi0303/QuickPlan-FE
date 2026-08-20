import { NavLink, Outlet } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import { useAppStore } from '../../store/useAppStore'

const navigation = [
  { to: '/', label: 'Overview', icon: '⌂', end: true },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/reminders', label: 'Reminders', icon: '◷' },
  { to: '/expenses', label: 'Money', icon: '₹' },
  { to: '/people', label: 'People', icon: '♧' },
]

export function AppShell() {
  const theme = useTheme()
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen)
  const toggleTheme = useAppStore((state) => state.toggleTheme)

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand"><span className="brand-mark">✦</span><span>quickplan</span></div>
        <div className="sidebar-section-label">Workspace</div>
        <nav className="sidebar-nav">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setSidebarOpen(false)}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/settings" onClick={() => setSidebarOpen(false)}><span className="nav-icon">⚙</span>Settings</NavLink>
          <div className="user-card"><span className="avatar">A</span><div><strong>Abhishek</strong><small>Personal space</small></div><span className="more">•••</span></div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="topbar-search"><span>⌕</span><input placeholder="Search anything..." aria-label="Search" /></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={toggleTheme}>{theme === 'light' ? '☾' : '☀'}</button>
            <button className="icon-button notification-button" aria-label="Notifications">♧<i /></button>
            <button className="top-avatar">A</button>
          </div>
        </header>
        <div className="page-container"><Outlet /></div>
      </main>
    </div>
  )
}
