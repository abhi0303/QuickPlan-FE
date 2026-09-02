import { Loader } from './Loader'
import './RouteLoading.scss'

/**
 * The wait between pressing a tab and its page arriving.
 *
 * Each page is a separate chunk, so on a slow connection there is a real gap.
 * Nothing on screen used to move during it, and the honest reading of a screen
 * that does not move is that the tap missed — so people tapped again.
 *
 * It fills the content area rather than the viewport: the sidebar, the header
 * and the tab bar stay exactly where they were, with the new tab already
 * highlighted, so the app looks like it is working rather than restarting.
 *
 * The bar at the top runs on its own, and only shows up if the wait lasts long
 * enough to notice — a chunk that arrives in 80ms should flash nothing at all.
 */
export function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-bar" />
      <Loader label="One moment" />
    </div>
  )
}
