import { create } from 'zustand'
import type { Reminder } from '../services/reminders'
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

/** Completion history behind the sidebar's streak card. */
export type Activity = {
  streak: number
  /** One flag per day for the last week, oldest first. */
  days: boolean[]
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
   * The money area's primary create dialog — a new group on the list, a new
   * expense inside one. Only one of those pages is ever mounted, so a single
   * flag lets the app shell's FAB open whichever is in front of the user.
   */
  moneyComposerOpen: boolean
  /** Bumped after any task mutation so views know to refetch. */
  tasksVersion: number
  /**
   * Figures the shell shows but does not fetch. The dashboard publishes them;
   * until it has, they are null and the shell shows nothing rather than a
   * number it made up.
   */
  activity: Activity | null
  openToday: number | null
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
  publishActivity: (activity: Activity | null, openToday: number | null) => void
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
      moneyComposerOpen: false,
      tasksVersion: 0,
      activity: null,
      openToday: null,
      celebrationId: 0,
      editingTask: null,
      editingReminder: null,
      setTheme: (theme) => set({ theme }),
      setRingtone: (ringtone) => set({ ringtone }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      // closing always clears the seed so a stale transcript can never be
      // re-applied the next time Quick Add opens
      setQuickAddOpen: (quickAddOpen) => set(quickAddOpen ? { quickAddOpen } : { quickAddOpen, quickAddSeed: '' }),
      openQuickAddWithText: (quickAddSeed) => set({ quickAddSeed, quickAddOpen: true }),
      setMoneyComposerOpen: (moneyComposerOpen) => set({ moneyComposerOpen }),
      bumpTasksVersion: () => set((state) => ({ tasksVersion: state.tasksVersion + 1 })),
      publishActivity: (activity, openToday) => set({ activity, openToday }),
      celebrate: () => set((state) => ({ celebrationId: state.celebrationId + 1 })),
      setEditingTask: (editingTask) => set({ editingTask }),
      setEditingReminder: (editingReminder) => set({ editingReminder }),
      signIn: (session) => set({ session, sidebarOpen: false }),
      updateSession: (patch) => set((state) => (state.session ? { session: { ...state.session, ...patch } } : state)),
      signOut: () =>
        set({
          session: null, sidebarOpen: false, quickAddOpen: false, quickAddSeed: '',
          moneyComposerOpen: false, editingTask: null, editingReminder: null,
          activity: null, openToday: null,
        }),
    }),
    {
      name: 'quickplan-preferences',
      version: 1,
      partialize: (state) => ({ theme: state.theme, ringtone: state.ringtone, session: state.session }),
      // v0 stored a session without a token; those can no longer authenticate.
      migrate: (persisted) => {
        const state = persisted as { theme?: Theme; ringtone?: string; session?: Session | null } | undefined
        const session = state?.session?.token ? state.session : null
        return { theme: state?.theme ?? 'light', ringtone: state?.ringtone ?? DEFAULT_RINGTONE_ID, session }
      },
    },
  ),
)
