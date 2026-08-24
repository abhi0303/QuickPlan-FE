/**
 * Where each step points.
 *
 * The backend names the steps and writes the copy; the DOM is this side's
 * business, so the mapping lives here. Its `route` also wins over the one the
 * API sends — the tour talks about "money", this app routes it at `/expenses`,
 * and gamification is a panel on the dashboard rather than a page.
 *
 * `selectors` are tried in order and the first *visible* match is used, which
 * is how one entry covers both layouts: the sidebar on a desktop and the bottom
 * bar on a phone.
 */
export type TourTarget = {
  route: string
  selectors?: string[]
  /** Where the card sits when there is a choice. */
  prefer?: 'below' | 'above' | 'center'
}

export const TOUR_TARGETS: Record<string, TourTarget> = {
  welcome: { route: '/', prefer: 'center' },

  tasks: {
    route: '/tasks',
    selectors: ['.sidebar-nav a[href$="/tasks"]', '.bottom-nav a[href$="/tasks"]', '.tasks-page .page-head'],
  },

  reminders: {
    route: '/reminders',
    selectors: ['.sidebar-nav a[href$="/reminders"]', '.bottom-nav a[href$="/reminders"]', '.reminders-page .page-head'],
  },

  money: {
    route: '/expenses',
    selectors: ['.sidebar-nav a[href$="/expenses"]', '.bottom-nav a[href$="/expenses"]', '.groups-page .page-head'],
  },

  level: {
    route: '/',
    selectors: ['.missions-panel .rank-card', '.sidebar .rank-card', '.rank-chip'],
  },

  missions: {
    route: '/',
    selectors: ['.missions-panel .mission-list', '.missions-panel'],
  },

  finish: { route: '/', prefer: 'center' },
}

/** The first selector that matches something actually on screen. */
export function findTarget(step: string): HTMLElement | null {
  const target = TOUR_TARGETS[step]
  if (!target?.selectors) return null

  for (const selector of target.selectors) {
    const element = document.querySelector<HTMLElement>(selector)
    // a hidden layout — the sidebar on a phone — measures as a zero-size box
    if (element && element.getClientRects().length > 0) return element
  }
  return null
}
