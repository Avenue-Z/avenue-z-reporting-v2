// Pins `audience` at every caller of the audience-aware reports: client-facing
// routes and exports must pass "client", the internal dashboard "internal".
import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

const CALLER_DIRS = ['app/portal', 'components/export', 'app/dashboard']

/** Non-test source files under `dir` whose names end in one of `exts`. */
function sourceFiles(dir: string, exts: string[] = ['.tsx']): string[] {
  const abs = join(ROOT, dir)
  const out: string[] = []
  for (const name of readdirSync(abs)) {
    const p = join(abs, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(join(dir, name), exts))
    else if (exts.some((e) => name.endsWith(e)) && !/\.test\.tsx?$/.test(name)) out.push(join(dir, name))
  }
  return out
}
const tsxFiles = (dir: string) => sourceFiles(dir)

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
  // A caller added anywhere else would escape the checks above, so a fourth place
  // has to be added to CALLER_DIRS with an audience decided (review #482, round 2).
  test('no caller lives outside the checked folders', () => {
    const outside = ['app', 'components', 'lib']
      .flatMap((d) => sourceFiles(d, ['.ts', '.tsx']))
      .filter((f) => !CALLER_DIRS.some((d) => f.startsWith(`${d}/`)))
      .filter((f) => /<(PeecAIReport|ContentImpactReport)\b|createElement\(\s*(PeecAIReport|ContentImpactReport)\b/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(outside).toEqual([])
  })
})
