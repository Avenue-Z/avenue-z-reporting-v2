// The notes panel runs in the browser, so nothing it imports may reach the database client: the first build of Unit E
// imported its chart names from notes.ts, which imports the Organic Social note checks, which import the annotation
// mutations and lib/db/client, and the local page failed with "Missing DATABASE_URL env var". jsdom tests cannot see that
// (the db module loads there without throwing), so this walks the panel's real imports. A 'use server' module is a
// reference in the browser, not its code, so the walk stops there; type-only imports are erased and skipped.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { expect, test } from 'vitest'

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? normalize(join(dirname(from), spec)) : null
  if (!base) return null
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (existsSync(base + ext)) return base + ext
  return null
}

/** Every repo module the browser loads for `entry`, following value imports and re-exports. */
function browserModules(entry: string): Set<string> {
  const seen = new Set<string>()
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    if (file !== entry && /^\s*['"]use server['"]/.test(src)) return
    for (const m of src.matchAll(/(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?'([^']+)'/g)) {
      if (m[1]) continue
      const target = resolve(file, m[2])
      if (target) walk(target)
    }
  }
  walk(entry)
  return seen
}

test('the notes panel never loads the database client in the browser', () => {
  const mods = browserModules('components/report-sections/organic-social/social-listening/notes-panel.tsx')
  expect(mods.has('lib/organic-social/social-listening/notes-keys.ts')).toBe(true)
  expect([...mods].filter((m) => m.startsWith('lib/db/'))).toEqual([])
})

test('the walk does find the database client where it is reached, so the check above is real', () => {
  expect(browserModules('lib/organic-social/social-listening/notes.ts').has('lib/db/client.ts')).toBe(true)
})
