import {
  Crown,
  FileDown,
  FileText,
  Music4,
  Table2,
} from 'lucide-react'

/**
 * What each level opens up.
 *
 * The catalogue is the single description of the reward ladder — the roadmap
 * dialog, the level-up celebration and (once gating lands) the features
 * themselves all read from here, so a perk is described in one place.
 *
 * Most of these are client-side conveniences the app can gate by hiding a
 * control. AUTO_OWNER is not: the role a new member joins with is decided by
 * the server, so that one is listed here for the roadmap and enforced there.
 */
export type UnlockId =
  | 'TASK_CSV'
  | 'EXTRA_RINGTONES'
  | 'AUTO_OWNER'
  | 'GROUP_EXPORT'
  | 'SPEND_REPORT'

export type Unlock = {
  id: UnlockId
  level: number
  title: string
  /** One line, as it reads in the roadmap. */
  description: string
  /** Where the feature lives, so the dialog can say where to find it. */
  where: string
  icon: typeof FileDown
}

export const UNLOCKS: Unlock[] = [
  {
    id: 'TASK_CSV',
    level: 5,
    title: `Export Today's Tasks as CSV`,
    description: 'Download today’s tasks as a spreadsheet, with how much of the day you have cleared.',
    where: 'Home → Today',
    icon: Table2,
  },
  {
    id: 'EXTRA_RINGTONES',
    level: 10,
    title: 'Two more alert sounds',
    description: 'Adds Sunrise and Beacon to the reminder ringtones.',
    where: 'Settings → Reminder sound',
    icon: Music4,
  },
  {
    id: 'AUTO_OWNER',
    level: 15,
    title: 'Join groups as an owner',
    description: 'Whoever adds you to a group gives you owner rights, so you can manage it too.',
    where: 'Any group you are added to',
    icon: Crown,
  },
  {
    id: 'GROUP_EXPORT',
    level: 20,
    title: 'Export a group',
    description: 'Every expense in a group as one file, including what each member owed.',
    where: 'A group → Export',
    icon: FileDown,
  },
  {
    id: 'SPEND_REPORT',
    level: 25,
    title: 'Printable spend report',
    description: 'A report with the category chart and a per-person breakdown, ready to save as PDF.',
    where: 'A group → Analysis',
    icon: FileText,
  },
]

/** Every perk that arrives at exactly this level — for the level-up moment. */
export function unlocksAt(level: number): Unlock[] {
  return UNLOCKS.filter((unlock) => unlock.level === level)
}

/**
 * Whether a level has earned a perk.
 *
 * Already correct, and already used by the roadmap dialog to draw the locked
 * state. The features themselves do not consult it yet — that is the switch to
 * flip once the behaviour has been reviewed.
 */
export function isUnlocked(id: UnlockId, level: number | undefined): boolean {
  const unlock = UNLOCKS.find((item) => item.id === id)
  return unlock ? (level ?? 0) >= unlock.level : true
}

/** The next thing to look forward to, or null at the top of the ladder. */
export function nextUnlock(level: number): Unlock | null {
  return UNLOCKS.find((unlock) => unlock.level > level) ?? null
}
