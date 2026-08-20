import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

type AppStore = {
  theme: Theme
  sidebarOpen: boolean
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    { name: 'quickplan-preferences' },
  ),
)
