import { isUnlocked } from '../data/unlocks'
import type { UnlockId } from '../data/unlocks'
import { useAppStore } from '../store/useAppStore'

/**
 * Whether a level-gated feature is available to this user.
 *
 * Reads the level the shell already fetched — no request of its own. While
 * gamification is still loading the level is unknown and this answers false, so
 * a feature appears once rather than flashing in and out.
 *
 * This is presentation only. Nothing here protects data: the perks are all
 * client-side conveniences over data the user can already see, so hiding the
 * button is the whole of the gate.
 */
export function useUnlocked(id: UnlockId): boolean {
  const level = useAppStore((state) => state.gamification?.level)
  return isUnlocked(id, level)
}
