import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

export type Session = {
  userId: string
  name: string
  email: string
  token: string
}

type AppStore = {
  theme: Theme
  sidebarOpen: boolean
  session: Session | null
  quickAddOpen: boolean
  /** Bumped after any task mutation so views know to refetch. */
  tasksVersion: number
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setSidebarOpen: (open: boolean) => void
  setQuickAddOpen: (open: boolean) => void
  bumpTasksVersion: () => void
  signIn: (session: Session) => void
  updateSession: (patch: Partial<Omit<Session, 'token'>>) => void
  signOut: () => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarOpen: false,
      session: null,
      quickAddOpen: false,
      tasksVersion: 0,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setQuickAddOpen: (quickAddOpen) => set({ quickAddOpen }),
      bumpTasksVersion: () => set((state) => ({ tasksVersion: state.tasksVersion + 1 })),
      signIn: (session) => set({ session, sidebarOpen: false }),
      updateSession: (patch) => set((state) => (state.session ? { session: { ...state.session, ...patch } } : state)),
      signOut: () => set({ session: null, sidebarOpen: false, quickAddOpen: false }),
    }),
    {
      name: 'quickplan-preferences',
      version: 1,
      partialize: (state) => ({ theme: state.theme, session: state.session }),
      // v0 stored a session without a token; those can no longer authenticate.
      migrate: (persisted) => {
        const state = persisted as { theme?: Theme; session?: Session | null } | undefined
        const session = state?.session?.token ? state.session : null
        return { theme: state?.theme ?? 'light', session }
      },
    },
  ),
)
