import { create } from 'zustand'
import type { Reminder } from '../services/reminders'
import type { GamificationState, MissionCatalogue } from '../services/gamification'
import type { Task } from '../services/tasks'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

export const DEFAULT_RINGTONE_ID = 'chime'

export type Session = {
  userId: string
  name: string
  email: string
  token: string
}

type AppStore = {
  theme: Theme
  /** Which ringtone reminder alerts use. */
  ringtone: string
  sidebarOpen: boolean
  session: Session | null
  quickAddOpen: boolean
  /** Transcript captured before the modal opened; consumed as its initial text. */
  quickAddSeed: string
  /**
   * Whether Quick Add was opened by speaking. The server cannot tell a spoken
   * task from a typed one — parsing happens on this device — so the origin has
   * to be carried to the create call for voice missions to count.
   */
  quickAddViaVoice: boolean
  /**
   * The money area's primary create dialog — a new group on the list, a new
   * expense inside one. Only one of those pages is ever mounted, so a single
   * flag lets the app shell's FAB open whichever is in front of the user.
   */
  moneyComposerOpen: boolean
  /** Bumped after any task mutation so views know to refetch. */
  tasksVersion: number
  /**
   * Open tasks today, published by the dashboard for the shell's nav badge.
   * Null until the dashboard has loaded once — the shell shows nothing rather
   * than a number it made up.
   */
  openToday: number | null
  /** Missions and XP, fetched once by the shell and read by every consumer. */
  gamification: GamificationState | null
  missionCatalogue: MissionCatalogue | null
  gamificationLoading: boolean
  gamificationError: string
  /** Bumped by anything asking for a fresh read; the shell's hook watches it. */
  gamificationTick: number
  /** Bumped by Settings → Guide; the tour watches it and replays. */
  tourRequest: number
  /**
   * The last level the user has actually been shown. Persisted, so a level-up
   * is celebrated once rather than on every reload.
   */
  seenLevel: number | null
  /** Bumped only when finishing the last open task, to fire the celebration. */
  celebrationId: number
  /** The task currently open in the edit dialog, if any. */
  editingTask: Task | null
  /** The reminder currently open in the edit dialog, if any. */
  editingReminder: Reminder | null
  setTheme: (theme: Theme) => void
  setRingtone: (ringtone: string) => void
  toggleTheme: () => void
  setSidebarOpen: (open: boolean) => void
  setQuickAddOpen: (open: boolean) => void
  setMoneyComposerOpen: (open: boolean) => void
  openQuickAddWithText: (text: string) => void
  bumpTasksVersion: () => void
  publishOpenToday: (openToday: number | null) => void
  setGamification: (state: GamificationState | null, catalogue: MissionCatalogue | null) => void
  setGamificationStatus: (loading: boolean, error: string) => void
  refreshGamification: () => void
  requestTour: () => void
  setSeenLevel: (level: number | null) => void
  celebrate: () => void
  setEditingTask: (task: Task | null) => void
  setEditingReminder: (reminder: Reminder | null) => void
  signIn: (session: Session) => void
  updateSession: (patch: Partial<Omit<Session, 'token'>>) => void
  signOut: () => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      theme: 'light',
      ringtone: DEFAULT_RINGTONE_ID,
      sidebarOpen: false,
      session: null,
      quickAddOpen: false,
      quickAddSeed: '',
      quickAddViaVoice: false,
      moneyComposerOpen: false,
      tasksVersion: 0,
      openToday: null,
      gamification: null,
      missionCatalogue: null,
      gamificationLoading: true,
      gamificationError: '',
      gamificationTick: 0,
      tourRequest: 0,
      seenLevel: null,
      celebrationId: 0,
      editingTask: null,
      editingReminder: null,
      setTheme: (theme) => set({ theme }),
      setRingtone: (ringtone) => set({ ringtone }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      // closing always clears the seed so a stale transcript can never be
      // re-applied the next time Quick Add opens
      // opening it any other way starts from typed, and closing forgets both
      setQuickAddOpen: (quickAddOpen) => set(quickAddOpen
        ? { quickAddOpen, quickAddViaVoice: false }
        : { quickAddOpen, quickAddSeed: '', quickAddViaVoice: false }),
      openQuickAddWithText: (quickAddSeed) =>
        set({ quickAddSeed, quickAddOpen: true, quickAddViaVoice: true }),
      setMoneyComposerOpen: (moneyComposerOpen) => set({ moneyComposerOpen }),
      bumpTasksVersion: () => set((state) => ({ tasksVersion: state.tasksVersion + 1 })),
      publishOpenToday: (openToday) => set({ openToday }),
      setGamification: (gamification, missionCatalogue) =>
        set((state) => ({ gamification, missionCatalogue: missionCatalogue ?? state.missionCatalogue })),
      setGamificationStatus: (gamificationLoading, gamificationError) =>
        set({ gamificationLoading, gamificationError }),
      refreshGamification: () => set((state) => ({ gamificationTick: state.gamificationTick + 1 })),
      requestTour: () => set((state) => ({ tourRequest: state.tourRequest + 1 })),
      setSeenLevel: (seenLevel) => set({ seenLevel }),
      celebrate: () => set((state) => ({ celebrationId: state.celebrationId + 1 })),
      setEditingTask: (editingTask) => set({ editingTask }),
      setEditingReminder: (editingReminder) => set({ editingReminder }),
      signIn: (session) => set({ session, sidebarOpen: false }),
      updateSession: (patch) => set((state) => (state.session ? { session: { ...state.session, ...patch } } : state)),
      signOut: () =>
        set({
          session: null, sidebarOpen: false, quickAddOpen: false, quickAddSeed: '', quickAddViaVoice: false,
          moneyComposerOpen: false, editingTask: null, editingReminder: null,
          openToday: null, gamification: null, seenLevel: null,
        }),
    }),
    {
      name: 'quickplan-preferences',
      version: 1,
      partialize: (state) => ({
        theme: state.theme, ringtone: state.ringtone, session: state.session, seenLevel: state.seenLevel,
      }),
      // v0 stored a session without a token; those can no longer authenticate.
      migrate: (persisted) => {
        const state = persisted as {
          theme?: Theme; ringtone?: string; session?: Session | null; seenLevel?: number | null
        } | undefined
        const session = state?.session?.token ? state.session : null
        return {
          theme: state?.theme ?? 'light',
          ringtone: state?.ringtone ?? DEFAULT_RINGTONE_ID,
          session,
          seenLevel: state?.seenLevel ?? null,
        }
      },
    },
  ),
)
