#!/usr/bin/env node
/**
 * Cross-component CSS dependency check.
 *
 * Routes are lazy-loaded, so each page's styles are a separate chunk. A
 * component that renders a class defined in *another* component's stylesheet
 * looks fine while navigating — the other chunk is already loaded — and loses
 * its styling entirely on a cold load of that route.
 *
 * This has caught four real bugs in this project. It runs in CI because the
 * failure is invisible in development.
 *
 * A class is "available" to a component if it is defined in global.scss or in
 * any stylesheet reachable through that component's own imports.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'

const SRC = 'src'
const GLOBAL = 'src/styles/global.scss'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const files = walk(SRC)
const components = files.filter((file) => file.endsWith('.tsx'))
const stylesheets = files.filter((file) => file.endsWith('.scss'))

/** Classes each stylesheet defines — only the first segment of a selector. */
const defined = new Map()
for (const sheet of stylesheets) {
  const css = readFileSync(sheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const names = new Set()
  for (const [, selector] of css.matchAll(/([^{}]+)\{/g)) {
    for (const part of selector.split(',')) {
      const trimmed = part.trim()
      if (!trimmed || trimmed.startsWith('@')) continue
      const [first] = trimmed.split(/[\s>+~]/)
      const match = first.match(/\.([A-Za-z0-9_-]+)/)
      if (match) names.add(match[1])
    }
  }
  defined.set(sheet, names)
}

/** What each component imports, resolved to real files. */
const imports = new Map()
for (const component of components) {
  const source = readFileSync(component, 'utf8')
  const specs = [...source.matchAll(/from\s+'(\.[^']+)'/g), ...source.matchAll(/import\s+'(\.[^']+)'/g)]
  const resolved = new Set()
  for (const [, spec] of specs) {
    const base = normalize(join(dirname(component), spec))
    for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}.scss`]) {
      try {
        if (statSync(candidate).isFile()) { resolved.add(candidate); break }
      } catch { /* not this one */ }
    }
  }
  imports.set(component, resolved)
}

function reachableStyles(entry) {
  const seen = new Set()
  const found = new Set([GLOBAL])
  const stack = [entry]
  while (stack.length) {
    const current = stack.pop()
    if (seen.has(current)) continue
    seen.add(current)
    for (const dep of imports.get(current) ?? []) {
      if (dep.endsWith('.scss')) found.add(dep)
      else stack.push(dep)
    }
  }
  return found
}

let problems = 0
for (const component of components) {
  const source = readFileSync(component, 'utf8')
  const used = new Set()
  const chunks = [
    ...source.matchAll(/className=\{?["'`]([^"'`]+)["'`]/g),
    ...source.matchAll(/className=\{`([^`]*)`/g),
  ]
  for (const [, chunk] of chunks) {
    for (const token of chunk.split(/[\s$]+/)) {
      const name = token.replace(/[{}`]/g, '')
      if (/^[a-z][a-z0-9-]*$/.test(name)) used.add(name)
    }
  }

  const available = new Set()
  for (const sheet of reachableStyles(component)) {
    for (const name of defined.get(sheet) ?? []) available.add(name)
  }

  for (const name of used) {
    if (available.has(name)) continue
    const owners = stylesheets.filter((sheet) => defined.get(sheet)?.has(name))
    if (owners.length === 0) continue // not a styled class at all
    problems += 1
    console.error(`${component}\n  .${name} is defined in ${owners.join(', ')} but not reachable from here`)
  }
}

if (problems > 0) {
  console.error(`\n${problems} cross-component CSS dependenc${problems === 1 ? 'y' : 'ies'}.`)
  console.error('Move the shared rule to src/styles/global.scss, or import the stylesheet that owns it.')
  process.exit(1)
}

console.log(`No cross-component CSS dependencies (${components.length} components, ${stylesheets.length} stylesheets).`)
