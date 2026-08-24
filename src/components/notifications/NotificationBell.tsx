import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { differenceInSeconds, format, isToday, isYesterday, parseISO } from 'date-fns'
import {
  AlarmClock,
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheckBig,
  Crown,
  HandCoins,
  LoaderCircle,
  Receipt,
  Sparkles,
  Target,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import type { AppNotification, NotificationType } from '../../services/notifications'
import { avatarStyle, initials } from '../../utils/avatar'
import './NotificationBell.scss'

/** The glyph badged onto the avatar, and the tint that goes with it. */
const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  FRIEND_ADDED: UserPlus,
  GROUP_MEMBER_ADDED: Users,
  GROUP_MEMBER_REMOVED: UserMinus,
  GROUP_ROLE_CHANGED: Crown,
  GROUP_DELETED: UserMinus,
  EXPENSE_ADDED: Receipt,
  EXPENSE_UPDATED: Receipt,
  EXPENSE_DELETED: Receipt,
  SETTLEMENT_RECORDED: HandCoins,
  REMINDER_LEAD: AlarmClock,
  REMINDER_DUE: AlarmClock,
  TASK_DUE: CircleCheckBig,
  MISSION_COMPLETED: Target,
  LEVEL_UP: Sparkles,
}

/** A tone per family of event, so the badge says what kind at a glance. */
const TYPE_TONE: Record<NotificationType, string> = {
  FRIEND_ADDED: 'tone-friend',
  GROUP_MEMBER_ADDED: 'tone-group',
  GROUP_MEMBER_REMOVED: 'tone-group',
  GROUP_ROLE_CHANGED: 'tone-group',
  GROUP_DELETED: 'tone-group',
  EXPENSE_ADDED: 'tone-money',
  EXPENSE_UPDATED: 'tone-money',
  EXPENSE_DELETED: 'tone-money',
  SETTLEMENT_RECORDED: 'tone-money',
  REMINDER_LEAD: 'tone-time',
  REMINDER_DUE: 'tone-time',
  TASK_DUE: 'tone-time',
  MISSION_COMPLETED: 'tone-xp',
  LEVEL_UP: 'tone-xp',
}

/** Compact: "3m", "5h", "2d", then the date. A list of these has to stay narrow. */
function when(iso: string) {
  const date = parseISO(iso)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.max(0, differenceInSeconds(new Date(), date))
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`
  return format(date, 'd MMM')
}

function dayGroup(iso: string) {
  const date = parseISO(iso)
  if (Number.isNaN(date.getTime())) return 'Earlier'
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return 'Earlier'
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    items, unreadCount, loading, loadingMore, loaded, error, hasMore,
    refresh, loadMore, markRead, markAllRead, dismiss,
  } = useNotifications()

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  /**
   * Tapping a push banner lands here with `?n=<id>`: that notification has been
   * seen, so it is marked read and the parameter dropped from the URL.
   */
  const opened = searchParams.get('n')
  useEffect(() => {
    if (!opened) return
    markRead([opened])
    const next = new URLSearchParams(searchParams)
    next.delete('n')
    setSearchParams(next, { replace: true })
    // markRead is recreated every render; the id is what decides this runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  /** The feed is only fetched when someone actually looks at it. */
  function toggle() {
    const next = !open
    setOpen(next)
    if (next) refresh()
  }

  function follow(notification: AppNotification) {
    markRead([notification.id])
    setOpen(false)
    navigate(notification.url.startsWith('/') ? notification.url : `/${notification.url}`)
  }

  // day headings decided up front: comparing against the previous row keeps the
  // render pure, where carrying a running variable through the map would not be
  const rows = items.map((notification, index) => {
    const group = dayGroup(notification.createdAt)
    const previous = index > 0 ? dayGroup(items[index - 1].createdAt) : ''
    return { notification, heading: group === previous ? '' : group }
  })

  return (
    <div className="notif" ref={rootRef}>
      <button
        className={`icon-button ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={toggle}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={19} />
        {unreadCount > 0 && <span className="notif-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <header className="notif-head">
            <h2>Notifications {unreadCount > 0 && <span className="notif-pill">{unreadCount}</span>}</h2>
            {unreadCount > 0 && (
              <button className="notif-readall" onClick={markAllRead} title="Mark all read">
                <CheckCheck size={14} /> <span>Mark all read</span>
              </button>
            )}
          </header>

          {loading && !loaded && (
            <div className="notif-state"><LoaderCircle size={18} className="spin" /> Loading...</div>
          )}

          {!loading && error && (
            <div className="notif-state">
              <CircleAlert size={18} />
              <p>{error}</p>
              <button className="text-button" onClick={refresh}>Try again</button>
            </div>
          )}

          {loaded && !error && items.length === 0 && (
            <div className="notif-state empty">
              <span className="notif-empty-icon"><Bell size={22} /></span>
              <p>Nothing yet.</p>
              <small>Friend requests, group invites and reminders land here.</small>
            </div>
          )}

          {items.length > 0 && (
            <div className="notif-list">
              {rows.map(({ notification, heading }) => {
                const Icon = TYPE_ICON[notification.type] ?? Bell
                const tone = TYPE_TONE[notification.type] ?? 'tone-group'
                const name = notification.actor?.name ?? ''

                return (
                  <div key={notification.id}>
                    {heading && <p className="notif-day">{heading}</p>}

                    <div className={`notif-row ${notification.readAt ? '' : 'is-unread'}`}>
                      <button className="notif-main" onClick={() => follow(notification)}>
                        <span className="notif-figure">
                          {name
                            ? <span className="notif-avatar" style={avatarStyle(name)}>{initials(name)}</span>
                            : <span className="notif-avatar plain">{name.slice(0, 1) || '·'}</span>}
                          {/* the badge carries the kind, so the avatar can stay the person */}
                          <i className={`notif-badge ${tone}`}><Icon size={11} strokeWidth={2.6} /></i>
                        </span>

                        <span className="notif-copy">
                          <span className="notif-line">
                            <strong>{notification.title}</strong>
                            <time>{when(notification.createdAt)}</time>
                          </span>
                          <small>{notification.body}</small>
                        </span>
                      </button>

                      <button
                        className="notif-dismiss"
                        onClick={() => dismiss(notification.id)}
                        aria-label={`Dismiss ${notification.title}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {hasMore && (
                <button className="notif-more" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <><LoaderCircle size={14} className="spin" /> Loading...</> : 'Show older'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
