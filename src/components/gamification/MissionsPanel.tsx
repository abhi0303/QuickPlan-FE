import { useEffect, useRef, useState } from 'react'
import { AlarmClock, CircleAlert, CircleCheckBig, Clock3, Gift, Sparkles, Wallet } from 'lucide-react'
import { describeMission } from '../../services/gamification'
import type { Mission, MissionArea, MissionCatalogue, GamificationState } from '../../services/gamification'
import { useNow } from '../../hooks/useNow'
import { RankCard } from './RankCard'
import { MISSIONS_ANCHOR } from './RankChip'
import { UnlocksModal } from './UnlocksModal'
import { nextUnlock } from '../../data/unlocks'
import './Gamification.scss'

const AREA_ICON: Record<MissionArea, typeof Wallet> = {
  EXPENSE: Wallet,
  TASK: CircleCheckBig,
  REMINDER: AlarmClock,
}

/** Whole units only — a mission countdown does not need seconds. */
function remaining(expiresAt: string, nowMs: number) {
  const ends = new Date(expiresAt).getTime()
  if (Number.isNaN(ends)) return null
  const left = ends - nowMs
  if (left <= 0) return 'expiring'
  const hours = Math.floor(left / 3_600_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`
  if (hours >= 1) return `${hours}h left`
  return `${Math.max(1, Math.floor(left / 60_000))}m left`
}

function MissionRow({ mission, catalogue, nowMs }: {
  mission: Mission
  catalogue: MissionCatalogue | null
  nowMs: number
}) {
  const { title, description, area } = describeMission(mission, catalogue)
  const Icon = AREA_ICON[area] ?? CircleCheckBig
  const done = mission.status === 'COMPLETED'
  const expired = mission.status === 'EXPIRED'
  const pct = Math.min(100, (mission.progress / mission.target) * 100)

  return (
    <div className={`mission ${done ? 'is-done' : ''} ${expired ? 'is-expired' : ''}`}>
      <span className={`mission-icon area-${area.toLowerCase()}`}>
        {done ? <CircleCheckBig size={17} /> : <Icon size={17} />}
      </span>

      <div className="mission-copy">
        <div className="mission-line">
          <strong>{title}</strong>
          <span className="mission-xp">{done ? `+${mission.xp} XP` : `${mission.xp} XP`}</span>
        </div>
        <p>{description}</p>

        <div className="mission-track" role="img" aria-label={`${mission.progress} of ${mission.target}`}>
          <i style={{ width: `${pct}%` }} />
        </div>

        <div className="mission-foot">
          <span className="mission-progress">
            {expired ? 'Not finished in time' : `${Math.min(mission.progress, mission.target)} / ${mission.target}`}
          </span>
          {!done && !expired && (
            <span className="mission-time"><Clock3 size={11} /> {remaining(mission.expiresAt, nowMs)}</span>
          )}
          {done && <span className="mission-time done">Complete</span>}
        </div>
      </div>
    </div>
  )
}

/**
 * The three current missions plus the rank they feed.
 *
 * The countdown is display only: when one runs out the panel asks the backend
 * for a fresh read rather than deciding an expiry for itself, because a new
 * cycle is dealt server-side.
 */
export function MissionsPanel({
  state, catalogue, loading, error, onRetry, onExpire,
}: {
  state: GamificationState | null
  catalogue: MissionCatalogue | null
  loading: boolean
  error: string
  onRetry: () => void
  onExpire: () => void
}) {
  const nowMs = useNow()
  const [rewardsOpen, setRewardsOpen] = useState(false)
  // which expiry has already been reported, kept in a ref: asking the backend
  // is a side effect, not a piece of rendered state
  const asked = useRef('')

  const soonest = state?.missions
    .filter((mission) => mission.status === 'ACTIVE')
    .map((mission) => new Date(mission.expiresAt).getTime())
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => a - b)[0]

  useEffect(() => {
    if (!soonest || nowMs < soonest) return
    const key = String(soonest)
    if (asked.current === key) return
    asked.current = key
    onExpire()
  }, [soonest, nowMs, onExpire])

  return (
    <section className="panel missions-panel" id={MISSIONS_ANCHOR}>
      <div className="panel-heading">
        <h2><Sparkles size={16} /> Missions</h2>
        <div className="panel-head-side">
          {state && (
            <span className="count-pill">
              {state.missions.filter((m) => m.status === 'COMPLETED').length}/{state.missions.length}
            </span>
          )}
          {state && (
            <button className="text-button" onClick={() => setRewardsOpen(true)}>
              <Gift size={15} /> Rewards
            </button>
          )}
        </div>
      </div>

      {loading && !state && (
        <div className="mission-list">
          {[0, 1, 2].map((row) => <div className="mission-skeleton" key={row} />)}
        </div>
      )}

      {!loading && error && !state && (
        <div className="panel-state">
          <CircleAlert size={20} />
          <p>{error}</p>
          <button className="text-button" onClick={onRetry}>Try again</button>
        </div>
      )}

      {state && (
        <>
          <RankCard state={state} />

          <div className="mission-list">
            {state.missions.map((mission) => (
              <MissionRow key={mission.id} mission={mission} catalogue={catalogue} nowMs={nowMs} />
            ))}
          </div>

          {state.missions.length === 0 && (
            <p className="field-hint">A fresh set of missions is on its way.</p>
          )}

          {/* what the XP is actually for */}
          {(() => {
            const next = nextUnlock(state.level)
            return next ? (
              <button className="next-unlock" onClick={() => setRewardsOpen(true)}>
                <next.icon size={15} />
                <span><strong>{next.title}</strong> unlocks at level {next.level}</span>
                <em>{next.level - state.level} to go</em>
              </button>
            ) : null
          })()}
        </>
      )}
      {rewardsOpen && state && <UnlocksModal level={state.level} onClose={() => setRewardsOpen(false)} />}
    </section>
  )
}
