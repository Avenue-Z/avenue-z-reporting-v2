// What each design kit version draws (spec docs/superpowers/specs/2026-11-24-os-design-past-months.md, section 3).
// The table is held to the registries both ways: it names exactly the kit versions registered, and each entry is the
// version that kit version really renders.
import { afterEach, expect, test, vi } from 'vitest'
import { ORGANIC_SOCIAL_PARTS, PRE_KIT_PARTS } from '@/components/report-sections/organic-social/parts/registry'
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'
import { KIT_WRAPS, SHARED_KIT_WRAPS, drawnVersion } from './kit-wraps'

const pins = (reg: Record<string, Record<number, unknown>>) =>
  Object.entries(reg).flatMap(([id, vs]) => Object.keys(vs).map((v) => `${id}@${v}`))
const entries = (table: Readonly<Record<string, Readonly<Record<number, number>>>>) =>
  Object.entries(table).flatMap(([id, m]) => Object.entries(m).map(([kit, old]) => [id, Number(kit), old] as const))

afterEach(() => vi.restoreAllMocks()) // as index.test.tsx:160: a failing row must not leave a spy for the next

test('names exactly the kit versions the registry holds', () => {
  const pre = new Set(pins(PRE_KIT_PARTS))
  const kit = pins(ORGANIC_SOCIAL_PARTS).filter((p) => !pre.has(p)).sort()
  expect(kit.length).toBeGreaterThan(0)
  expect(entries(KIT_WRAPS).map(([id, v]) => `${id}@${v}`).sort()).toEqual(kit)
})

// Labels cannot prove this: platform-headlines @1 to @3 and ytd-review @1 to @4 share one label each. Every kit version
// calls its wrapped version's render when it runs (every kit file builds its versions with kitOf,
// parts/kit-swap.tsx:52), so the test spies on exactly that render and on none of its siblings.
test.each(entries(KIT_WRAPS))('%s@%i renders exactly the version it wraps, @%i', (id, kit, old) => {
  const wrapped = PRE_KIT_PARTS[id]?.[old]
  expect(wrapped).toBeDefined()
  const others = Object.values(PRE_KIT_PARTS[id]).filter((p) => p !== wrapped).map((p) => vi.spyOn(p, 'render').mockReturnValue(null))
  const spy = vi.spyOn(wrapped!, 'render').mockReturnValue(null)
  const ctx = { clientSlug: 'c' } as never
  const part = { id, version: kit, label: 'x' }
  ORGANIC_SOCIAL_PARTS[id][kit].render(ctx, part)
  expect(spy).toHaveBeenCalledExactlyOnceWith(ctx, part)
  for (const o of others) expect(o).not.toHaveBeenCalled()
})

test('the shared boxes: every version after @1 is in SHARED_KIT_WRAPS, and renders the version it wraps', () => {
  const later = pins(SHARED_PARTS).filter((p) => !p.endsWith('@1')).sort()
  expect(entries(SHARED_KIT_WRAPS).map(([id, v]) => `${id}@${v}`).sort()).toEqual(later)
  for (const [id, kit, old] of entries(SHARED_KIT_WRAPS)) {
    const wrapped = SHARED_PARTS[id]?.[old]
    expect(wrapped, `${id}@${old}`).toBeDefined()
    const spy = vi.spyOn(wrapped!, 'render').mockReturnValue(null)
    const ctx = { slug: 'c', viewKey: 'organic-social' } as never
    const part = { id, version: kit, label: 'x' }
    SHARED_PARTS[id][kit].render(ctx, part)
    expect(spy, `${id}@${kit}`).toHaveBeenCalledExactlyOnceWith(ctx, part)
    spy.mockRestore()
  }
})

test('drawnVersion: the kit version when the kit applies, else the version it wraps; any other version as it is', () => {
  expect(drawnVersion('top-content', 4, true)).toBe(4)
  expect(drawnVersion('top-content', 4, false)).toBe(3)
  expect(drawnVersion('platform-headlines', 6, false)).toBe(1)
  expect(drawnVersion('top-content', 2, false)).toBe(2) // not a kit version
  expect(drawnVersion('not-a-part', 7, false)).toBe(7)
})
