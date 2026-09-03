import { Suspense, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import {
  AlarmClock,
  CircleCheckBig,
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
import { LevelUpOverlay } from '../gamification/LevelUpOverlay'
import { RankCard } from '../gamification/RankCard'
import { RankChip } from '../gamification/RankChip'
import { NotificationBell } from '../notifications/NotificationBell'
import { OfflineBar } from '../offline/OfflineBar'
import { Tour } from '../onboarding/Tour'
import { QuickAddModal } from '../common/QuickAddModal'
import { EditReminderModal } from '../reminders/EditReminderModal'
import { ReminderAlerts } from '../reminders/ReminderAlerts'
import { EditTaskModal } from '../tasks/EditTaskModal'
import { PullToRefresh } from '../common/PullToRefresh'
import { RouteLoading } from '../common/RouteLoading'
import { SpeakButton } from '../common/SpeakButton'
import { useGamification } from '../../hooks/useGamification'
import { useOffline } from '../../hooks/useOffline'
import { useHideOnScroll } from '../../hooks/useHideOnScroll'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { useRefresh } from '../../hooks/useRefresh'
import { useRoutePrefetch } from '../../hooks/useRoutePrefetch'
import { useTheme } from '../../hooks/useTheme'
import { useAppStore } from '../../store/useAppStore'
import type { MoneyTab } from '../../store/useAppStore'
import './AppShell.scss'

/**
 * Where the microphone is offered.
 *
 * Personal money joins tasks and reminders now that a spoken sentence is enough
 * to record one — "spent 400 on petrol" needs nothing else. A group expense
 * still does not: a sentence cannot name who is in the split, so the Groups
 * half keeps the plus button alone.
 */
const VOICE_ROUTES = ['/', '/tasks', '/reminders']

/**
 * Quick Add only makes tasks and reminders, so across the money area the FAB
 * offers that page's own create action instead.
 */
function moneyAction(pathname: string, moneyTab: MoneyTab | null) {
  // the Money page has two halves, and the FAB offers whichever is in front
  if (pathname === '/expenses') return moneyTab === 'personal' ? 'Add expense' : 'New group'
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
  const moneyTab = useAppStore((state) => state.moneyTab)
  // published by the dashboard; null until it has loaded once
  const openToday = useAppStore((state) => state.openToday)
  // fetched once here and published to the store, so the sidebar card and the
  // dashboard panel cost one request between them
  const { levelUp, acknowledgeLevelUp } = useGamification()
  /*
   * An installed app has no reload button of its own. On a phone that is the
   * pull-down gesture people already try; on a desktop the browser's own
   * reload is right there, so nothing is added to the header for it.
   */
  const { refresh } = useRefresh()
  // they sit where a list keeps its own controls, so they step aside while it
  // is being read downwards
  const tucked = useHideOnScroll()
  const pull = usePullToRefresh(refresh)
  // starts the outbox: it flushes on open, on reconnect, and on Background Sync
  useOffline()
  // warms the other tabs while nothing else is happening
  useRoutePrefetch()
  const game = useAppStore((state) => state.gamification)
  const showThemeToggle = useAppStore((state) => state.showThemeToggle)
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType === 'POP') return
    window.scrollTo(0, 0)
  }, [pathname, navigationType])
  const showVoiceButton = VOICE_ROUTES.includes(pathname)
    || (pathname === '/expenses' && moneyTab === 'personal')
  const moneyLabel = moneyAction(pathname, moneyTab)

  /*
   * The money sub-pages either carry their own primary button in the header or
   * are there to be read. A floating Quick Add on top of them is one more thing
   * covering the figures, so it stays on the pages that are about capturing.
   */
  const showFab = !pathname.startsWith('/expenses/')

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

  return (
    <div className="app-shell">
      <PullToRefresh distance={pull.distance} state={pull.state} />
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

        {/* the rank card replaces the old streak: it is the same glance, but
            the number behind it is real */}
        {game && <RankCard state={game} compact />}

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
          {/* the mark alone: on a phone the name was taking a third of the
              header to say what the icon already says. It goes home, which is
              what a logo in a corner is for. */}
          <NavLink to="/" className="brand topbar-brand" aria-label="Home" end>
            <span className="brand-mark sm"><Sparkles size={15} strokeWidth={2.4} /></span>
          </NavLink>

          {/* Global search is hidden until there is an API to back it: no
              search endpoint exists yet (see docs/push-notifications.md's
              sibling note in the API review). Restore this block once
              GET /api/search lands. */}

          <div className="topbar-actions">
            {/* mobile only: the sidebar's rank card is not there to show it */}
            {game && <RankChip state={game} />}
            {/* kept out of the header by anyone who sets their theme once */}
            {showThemeToggle && (
              <button
                className="icon-button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
              </button>
            )}
            <NotificationBell />
            <NavLink to="/settings" className="icon-button settings-button" aria-label="Settings">
              <Settings size={19} />
            </NavLink>
            {/* the avatar carries settings on a phone, where the gear is hidden
                to make room for the rank chip */}
            <NavLink to="/settings" className="avatar sm" aria-label="Settings">{initial}</NavLink>
          </div>
        </header>

        {/*
          * The boundary lives here, not around the router.
          *
          * A page's code arrives in its own chunk, so switching tabs suspends.
          * Suspending against the outer boundary blanked the whole app — nav
          * included — which read as nothing having happened, and people pressed
          * the tab again. Keeping the shell up means the tab you pressed is
          * already highlighted while its page is still on its way.
          */}
        <div className="page-container">
          <Suspense fallback={<RouteLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* with no voice button on this page the FAB takes its lower, easier to
          reach slot rather than floating over the middle of the content */}
      {showFab && (
        <button
          className={`fab ${showVoiceButton ? '' : 'in-voice-slot'} ${tucked ? 'is-tucked' : ''}`}
          aria-label={moneyLabel ?? 'Quick add'}
          title={moneyLabel ?? 'Quick add'}
          onClick={() => (moneyLabel ? setMoneyComposerOpen(true) : setQuickAddOpen(true))}
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}

      {showVoiceButton && <SpeakButton floating tucked={tucked} />}

      {levelUp && (
        <LevelUpOverlay
          from={levelUp.from}
          to={levelUp.to}
          rankName={levelUp.rankName}
          onClose={acknowledgeLevelUp}
        />
      )}

      <OfflineBar />

      <Tour />

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
