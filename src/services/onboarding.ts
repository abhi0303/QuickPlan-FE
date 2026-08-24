import { api } from './api'

/**
 * The guided tour.
 *
 * The backend owns the script — which steps exist, their order and their copy —
 * so wording can change without a frontend release. It deliberately does not
 * know the DOM: each step carries an `id`, and this client decides which route
 * to visit and which element to point at.
 *
 * Progress is a version rather than a boolean, so bumping the tour version
 * shows it again to everyone without a migration.
 */
export type TourStep = {
  id: string
  order: number
  title: string
  body: string
  /** The backend's own idea of the route; this app maps by `id` instead. */
  route: string
  area: string
}

export type TourState = {
  shouldShow: boolean
  version: number
  completedVersion: number
  completedAt: string | null
  /** 1-based, 0 before the tour has started. */
  currentStep: number
  steps: TourStep[]
}

const EMPTY: TourState = {
  shouldShow: false,
  version: 0,
  completedVersion: 0,
  completedAt: null,
  currentStep: 0,
  steps: [],
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalize(payload: unknown): TourState {
  const body = (payload ?? {}) as Record<string, unknown>
  const rawSteps = Array.isArray(body.steps) ? body.steps : []

  const steps = rawSteps
    .map((raw, index) => {
      const source = raw as Record<string, unknown>
      const id = str(source.id)
      if (!id) return null
      return {
        id,
        order: num(source.order, index + 1),
        title: str(source.title) ?? '',
        body: str(source.body) ?? '',
        route: str(source.route) ?? '/',
        area: str(source.area) ?? '',
      }
    })
    .filter((step): step is TourStep => step !== null)
    .sort((a, b) => a.order - b.order)

  return {
    shouldShow: body.shouldShow === true,
    version: num(body.version),
    completedVersion: num(body.completedVersion),
    completedAt: str(body.completedAt) ?? null,
    currentStep: num(body.currentStep),
    steps,
  }
}

export async function getTour(): Promise<TourState> {
  const { data } = await api.get('/api/onboarding')
  return normalize(data)
}

/**
 * Progress only moves forward on the server, so a late request cannot drag
 * someone back — this can be fired and forgotten.
 */
export async function saveTourProgress(step: number): Promise<void> {
  await api.patch('/api/onboarding/progress', { step })
}

export async function completeTour(): Promise<void> {
  await api.post('/api/onboarding/complete')
}

/** Dismissing counts as finished; Settings → Guide is the way back. */
export async function skipTour(): Promise<void> {
  await api.post('/api/onboarding/skip')
}

export async function restartTour(): Promise<TourState> {
  const { data } = await api.post('/api/onboarding/restart')
  const state = normalize(data)
  return state.steps.length ? state : { ...EMPTY, shouldShow: true }
}
