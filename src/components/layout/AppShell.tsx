import { NavLink, Outlet } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import { useAppStore } from '../../store/useAppStore'

const navigation = [
  { to: '/', label: 'Overview', icon: 'space_dashboard', end: true },
  { to: '/tasks', label: 'Tasks', icon: 'task_alt' },
  { to: '/reminders', label: 'Reminders', icon: 'schedule' },
  { to: '/expenses', label: 'Money', icon: 'payments' },
  { to: '/people', label: 'People', icon: 'group' },
]

export function AppShell() {
  const theme = useTheme()
  const session = useAppStore((state) => state.session)
  const signOut = useAppStore((state) => state.signOut)
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
              <span className="material-symbols-outlined nav-icon">{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/settings" onClick={() => setSidebarOpen(false)}><span className="material-symbols-outlined nav-icon">settings</span>Settings</NavLink>
          <div className="user-card"><span className="avatar">{session?.name.charAt(0).toUpperCase() ?? 'A'}</span><div><strong>{session?.name ?? 'Abhishek'}</strong><small>Personal space</small></div><button className="more" onClick={signOut} aria-label="Sign out"><span className="material-symbols-outlined">logout</span></button></div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><span className="material-symbols-outlined">menu</span></button>
          <div className="topbar-search"><span className="material-symbols-outlined">search</span><input placeholder="Search anything..." aria-label="Search" /></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={toggleTheme}><span className="material-symbols-outlined">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span></button>
            <button className="icon-button notification-button" aria-label="Notifications"><span className="material-symbols-outlined">notifications</span><i /></button>
            <button className="top-avatar">{session?.name.charAt(0).toUpperCase() ?? 'A'}</button>
          </div>
        </header>
        <div className="page-container"><Outlet /></div>
      </main>
    </div>
  )
}
