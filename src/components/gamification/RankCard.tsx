import { rankIconUrl, rankTier } from '../../services/gamification'
import type { GamificationState } from '../../services/gamification'
import './Gamification.scss'

/**
 * Level, rank and the XP bar.
 *
 * `compact` is the sidebar's version; the full one heads the missions panel.
 * The backend sends only a level number — the badge art is a frontend asset,
 * picked by that number.
 */
export function RankCard({ state, compact }: { state: GamificationState, compact?: boolean }) {
  const tier = rankTier(state.level)
  const pct = Math.max(0, Math.min(100, state.progressPercentage))

  return (
    <div className={`rank-card tier-${tier} ${compact ? 'is-compact' : ''}`}>
      <img
        className="rank-badge"
        src={rankIconUrl(state.level)}
        width={compact ? 44 : 62}
        height={compact ? 44 : 62}
        alt=""
        loading="lazy"
      />

      <div className="rank-copy">
        <p className="rank-level">Level {state.level}</p>
        <strong className="rank-name">{state.rankName || 'Unranked'}</strong>

        <div className="xp-bar" role="img" aria-label={`${state.xpIntoLevel} of ${state.xpForNextLevel} XP to level ${state.level + 1}`}>
          <i style={{ width: `${pct}%` }} />
        </div>

        <p className="xp-line">
          {state.level >= 100
            ? `${state.totalXp.toLocaleString('en-IN')} XP · max rank`
            : <>{state.xpIntoLevel} / {state.xpForNextLevel} XP to level {state.level + 1}</>}
        </p>
      </div>
    </div>
  )
}
