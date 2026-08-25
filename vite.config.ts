import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages serves static files only, so a deep link like /QuickPlan-FE/auth
 * 404s before the SPA ever boots. Pages falls back to 404.html for any unknown
 * path, so shipping a copy of index.html under that name lets the app load and
 * lets React Router read the real URL from window.location.
 */
function githubPagesSpaFallback(): Plugin {
  let root = process.cwd()
  let outDir = 'dist'

  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    closeBundle() {
      const index = resolve(root, outDir, 'index.html')
      if (!existsSync(index)) return
      copyFileSync(index, resolve(root, outDir, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), githubPagesSpaFallback()],
  base: mode === 'production' ? '/QuickPlan-FE/' : '/',

  test: {
    // jsdom rather than node: several modules read `navigator` or `window`,
    // and component tests will need it soon enough
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      /*
       * Only the modules that are actually tested are measured, and they are
       * held high. A global target across the whole app rewards tests written
       * to raise a number rather than to catch anything — and it would make
       * this threshold meaningless on the day someone adds a new service.
       *
       * Add a file here when it gains a suite.
       */
      include: [
        'src/services/smartParser.ts',
        'src/services/exportFile.ts',
        'src/data/unlocks.ts',
        'src/components/reminders/reminderTime.ts',
      ],
      /*
       * Set just under where the suite stands today, as a ratchet: it fails
       * when coverage drops, not when it fails to reach an aspiration. Raise
       * these as the gaps in `known gaps` get closed.
       */
      thresholds: { statements: 78, branches: 66, functions: 85, lines: 83 },
    },
  },
}))
