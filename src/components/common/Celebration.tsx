import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { PartyPopper } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import './Celebration.scss'

const COLORS = ['#0fb58a', '#2ecfa1', '#6c7bff', '#f2871f', '#e0526d', '#ffd166']
const PIECES = 46

type Piece = {
  left: number
  delay: number
  duration: number
  drift: number
  spin: number
  color: string
  size: number
  round: boolean
}

function buildPieces(): Piece[] {
  return Array.from({ length: PIECES }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.35,
    duration: 2 + Math.random() * 1.2,
    drift: (Math.random() - 0.5) * 240,
    spin: 360 + Math.random() * 720,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 7 + Math.random() * 7,
    round: Math.random() > 0.65,
  }))
}

/**
 * Confetti burst for finishing the last open task.
 *
 * Driven purely by `celebrationId` with no effect: the wrapper's own animation
 * ending marks that id as spent, so it plays exactly once per trigger and
 * never replays on mount or re-render.
 */
export function Celebration() {
  const celebrationId = useAppStore((state) => state.celebrationId)
  const [spentId, setSpentId] = useState(0)

  const pieces = useMemo(() => (celebrationId ? buildPieces() : []), [celebrationId])
  const visible = celebrationId > 0 && spentId !== celebrationId
  if (!visible) return null

  return createPortal(
    <div className="celebration" aria-hidden="true" onAnimationEnd={() => setSpentId(celebrationId)}>
      {pieces.map((piece, index) => (
        <i
          key={index}
          className={piece.round ? 'is-round' : ''}
          style={{
            left: `${piece.left}%`,
            width: `${piece.size}px`,
            height: `${piece.size * (piece.round ? 1 : 1.6)}px`,
            background: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            '--drift': `${piece.drift}px`,
            '--spin': `${piece.spin}deg`,
          } as React.CSSProperties}
        />
      ))}

      <div className="celebration-badge" role="status">
        <PartyPopper size={20} />
        All done — nice work!
      </div>
    </div>,
    document.body,
  )
}
