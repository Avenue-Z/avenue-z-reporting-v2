// A server module may render a component from a 'use client' module, but it can never CALL a function or read a value
// from one: on the server those exports are client references, and calling one throws at render ("Attempted to call
// lookOf() from the server but lookOf is on the client"). jsdom tests cannot see that boundary and check:rsc checks props
// only, so the design kit's Trend graphs PR (#498) shipped exactly this to a local render before this test existed:
// follower-graph.tsx (server) called lookOf from trends.tsx ('use client'), which would have broken every follower graph.
// This holds every Organic Social module to the rule: from a client module, a server module imports components only.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { expect, test } from 'vitest'

const ROOT = 'components/report-sections/organic-social'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name.startsWith('__') ? [] : files(p)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}
const isClient = (path: string) => /^\s*['"]use client['"]/.test(readFileSync(path, 'utf8'))
function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? normalize(join(dirname(from), spec)) : null
  if (!base) return null
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (existsSync(base + ext)) return base + ext
  return null
}

/** Every non-type, non-component name a server module imports from a client module. */
export function boundaryViolations(paths: string[]): string[] {
  const out: string[] = []
  for (const file of paths) {
    if (isClient(file)) continue
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
      if (m[1]) continue
      const target = resolve(file, m[3])
      if (!target || !isClient(target)) continue
      const values = m[2].split(',').map((n) => n.trim()).filter((n) => n && !n.startsWith('type '))
      // A component is PascalCase; anything else (a function, a constant) is a value the server cannot use.
      for (const name of values) if (!/^[A-Z][a-z]/.test(name.split(' as ')[0])) out.push(`${file} imports ${name} from ${target}`)
    }
  }
  return out
}

test('no Organic Social server module imports a function or value from a client module', () => {
  expect(boundaryViolations(files(ROOT))).toEqual([])
})

test('the check itself catches the shape that broke: a server file calling a helper from a client file', () => {
  const found = boundaryViolations(files(ROOT))
  // The scan must see the real files it guards, or an empty result proves nothing.
  expect(files(ROOT).some((f) => f.endsWith('follower-graph.tsx'))).toBe(true)
  expect(files(ROOT).filter(isClient).some((f) => f.endsWith('trends.tsx'))).toBe(true)
  expect(found.every((v) => v.includes(' imports '))).toBe(true)
})
