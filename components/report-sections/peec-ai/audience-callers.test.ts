// Pins `audience` at every caller of the audience-aware reports: client-facing
// routes and exports must pass "client", the internal dashboard "internal".
import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function tsxFiles(dir: string): string[] {
  const abs = join(ROOT, dir)
  const out: string[] = []
  for (const name of readdirSync(abs)) {
    const p = join(abs, name)
    if (statSync(p).isDirectory()) out.push(...tsxFiles(join(dir, name)))
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(join(dir, name))
  }
  return out
}

/** Every `<PeecAIReport ...>` / `<ContentImpactReport ...>` opening tag, with its audience prop. */
function uses(dirs: string[]): { file: string; tag: string; audience: string | null }[] {
  const found: { file: string; tag: string; audience: string | null }[] = []
  for (const file of dirs.flatMap(tsxFiles)) {
    const src = readFileSync(join(ROOT, file), 'utf8')
    for (const m of src.matchAll(/<(PeecAIReport|ContentImpactReport)\b([\s\S]*?)\/?>/g)) {
      found.push({ file, tag: m[1], audience: /\baudience=(?:"([^"]*)"|\{'([^']*)'\})/.exec(m[2])?.slice(1).find(Boolean) ?? null })
    }
  }
  return found
}

describe('report audience is pinned at every caller', () => {
  const client = uses(['app/portal', 'components/export'])
  const internal = uses(['app/dashboard'])

  test('finds the known call sites (not vacuous)', () => {
    expect(client.length).toBeGreaterThanOrEqual(5)
    expect(internal.length).toBeGreaterThanOrEqual(2)
    expect(client.some((u) => u.file.includes('[reportSlug]'))).toBe(true)
  })
  test('app/portal and components/export pass audience="client"', () => {
    expect(client.filter((u) => u.audience !== 'client')).toEqual([])
  })
  test('app/dashboard passes audience="internal"', () => {
    expect(internal.filter((u) => u.audience !== 'internal')).toEqual([])
  })
})
