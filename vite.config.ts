import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
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
}))
