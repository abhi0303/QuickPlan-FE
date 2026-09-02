import { useLocation, useNavigate } from 'react-router-dom'
import { rankIconUrl, rankTier } from '../../services/gamification'
import type { GamificationState } from '../../services/gamification'
import './Gamification.scss'

/** Where the missions panel lives, and what the chip scrolls to. */
export const MISSIONS_ANCHOR = 'missions'

/**
 * The level, in the sticky header.
 *
 * On a phone the missions panel is well below the fold and the sidebar card
 * does not exist, so rank had nowhere to show. This keeps it in view wherever
 * the user is, and tapping it goes to the panel — from another tab it goes home
 * first, since that is where the panel lives.
 */
export function RankChip({ state }: { state: GamificationState }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  function open() {
    if (pathname === '/') {
      document.getElementById(MISSIONS_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    navigate('/', { state: { scrollTo: MISSIONS_ANCHOR } })
  }

  return (
    <button
      type="button"
      className={`rank-chip tier-${rankTier(state.level)}`}
      onClick={open}
      aria-label={`Level ${state.level}, ${state.rankName}. Open missions`}
      title={`${state.rankName} · ${state.xpIntoLevel}/${state.xpForNextLevel} XP`}
    >
      {/* the badge art already carries a ring; a second one around it read as
          clutter, so progress stays on the card and this stays the medallion */}
      <img src={rankIconUrl(state.level)} width="22" height="22" alt="" />
      <span className="chip-level">{state.level}</span>
    </button>
  )
}
