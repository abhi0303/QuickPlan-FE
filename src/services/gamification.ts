import { api } from './api'

/**
 * Missions and XP.
 *
 * Two read endpoints and nothing to write: the client cannot award XP, set a
 * target or complete a mission, and does not need to. Progress comes from real
 * activity — adding an expense, creating or finishing a task — and the next
 * read reflects it. Anything that looks like a write returns 404 by design.
 */

export const MISSION_STATUSES = ['ACTIVE', 'COMPLETED', 'EXPIRED'] as const
export type MissionStatus = (typeof MISSION_STATUSES)[number]

export type MissionArea = 'EXPENSE' | 'TASK' | 'REMINDER'

/** One of the three missions currently dealt to this user. */
export type Mission = {
  id: string
  /** Joins to the catalogue — with the target, never alone. */
  type: string
  target: number
  progress: number
  status: MissionStatus
  xp: number
  createdAt: string
  expiresAt: string
}

export type GamificationState = {
  totalXp: number
  level: number
  rankName: string
  /** Cumulative XP where this level began, and where the next one begins. */
  currentLevelXp: number
  nextLevelXp: number
  /** The two the progress bar actually needs. */
  xpIntoLevel: number
  xpForNextLevel: number
  progressPercentage: number
  missions: Mission[]
}

export type MissionDefinition = {
  type: string
  target: number
  xp: number
  area: MissionArea
  title: string
  description: string
}

export type MissionCatalogue = {
  xpPerMission: number
  missionsPerCycle: number
  cycleDurationDays: number
  missions: MissionDefinition[]
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeMission(raw: unknown): Mission | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const id = str(source.id)
  const type = str(source.type)
  if (!id || !type) return null

  const status = str(source.status)
  return {
    id,
    type,
    target: Math.max(1, num(source.target, 1)),
    progress: Math.max(0, num(source.progress)),
    status: (MISSION_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as MissionStatus)
      : 'ACTIVE',
    xp: num(source.xp, 100),
    createdAt: str(source.createdAt) ?? '',
    expiresAt: str(source.expiresAt) ?? '',
  }
}

/**
 * The endpoints publish no response schema, so the numbers the UI divides by
 * are guarded: a missing `xpForNextLevel` would otherwise render a bar of
 * width Infinity.
 */
export async function getGamification(): Promise<GamificationState> {
  const { data } = await api.get('/api/gamification')
  const body = (data ?? {}) as Record<string, unknown>
  const missions = Array.isArray(body.missions) ? body.missions : []

  return {
    totalXp: num(body.totalXp),
    level: Math.max(1, num(body.level, 1)),
    rankName: str(body.rankName) ?? '',
    currentLevelXp: num(body.currentLevelXp),
    nextLevelXp: num(body.nextLevelXp),
    xpIntoLevel: num(body.xpIntoLevel),
    xpForNextLevel: Math.max(1, num(body.xpForNextLevel, 100)),
    progressPercentage: num(body.progressPercentage),
    missions: missions.map(normalizeMission).filter((m): m is Mission => m !== null),
  }
}

export async function getMissionCatalogue(): Promise<MissionCatalogue> {
  const { data } = await api.get('/api/gamification/catalogue')
  const body = (data ?? {}) as Record<string, unknown>
  const missions = Array.isArray(body.missions) ? body.missions : []

  return {
    xpPerMission: num(body.xpPerMission, 100),
    missionsPerCycle: num(body.missionsPerCycle, 3),
    cycleDurationDays: num(body.cycleDurationDays, 2),
    missions: missions
      .map((raw) => {
        const source = raw as Record<string, unknown>
        const type = str(source.type)
        if (!type) return null
        return {
          type,
          target: num(source.target, 1),
          xp: num(source.xp, 100),
          area: (str(source.area) ?? 'TASK') as MissionArea,
          title: str(source.title) ?? 'Mission',
          description: str(source.description) ?? '',
        }
      })
      .filter((m): m is MissionDefinition => m !== null),
  }
}

/**
 * The catalogue holds several variants of the same type — "Add 3 expenses" and
 * "Add 5 expenses" are both EXPENSE_COUNT — so a mission resolves on type *and*
 * target. Matching on type alone shows the wrong title.
 */
export function describeMission(
  mission: Mission,
  catalogue: MissionCatalogue | null,
): { title: string, description: string, area: MissionArea } {
  const exact = catalogue?.missions.find((m) => m.type === mission.type && m.target === mission.target)
  if (exact) return { title: exact.title, description: exact.description, area: exact.area }

  // an unknown type still renders: the backend can add missions without the
  // client shipping first
  const sameType = catalogue?.missions.find((m) => m.type === mission.type)
  return {
    title: sameType?.title ?? 'Mission',
    description: sameType?.description ?? `Reach ${mission.target}`,
    area: sameType?.area ?? areaFromType(mission.type),
  }
}

function areaFromType(type: string): MissionArea {
  if (type.startsWith('EXPENSE')) return 'EXPENSE'
  if (type.startsWith('REMINDER')) return 'REMINDER'
  return 'TASK'
}

/** Rank art lives in the frontend; the backend only ever sends a level number. */
export function rankIconUrl(level: number) {
  const clamped = Math.min(100, Math.max(1, Math.round(level)))
  return `${import.meta.env.BASE_URL}gamification/levels/level-${String(clamped).padStart(3, '0')}.svg`
}

/** The five tiers the icons are drawn in, for accent colours in the UI. */
export function rankTier(level: number): 'beginner' | 'saving' | 'growth' | 'mastery' | 'legendary' | 'ultimate' {
  if (level >= 100) return 'ultimate'
  if (level >= 81) return 'legendary'
  if (level >= 61) return 'mastery'
  if (level >= 41) return 'growth'
  if (level >= 21) return 'saving'
  return 'beginner'
}
