// The registration slots for the kit's part versions (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md,
// "Zero-conflict registration"). Each round 2 PR fills one pair of files here and touches no shared list, so the seven PRs
// merge in any order. These guards hold every slot to the plan's rules from the day it is filled.
import { describe, expect, test } from 'vitest'
import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../../ctx'
import { ORGANIC_SOCIAL_PARTS, PRE_KIT_PARTS } from '../registry'
import { EXPORT_LAYOUT } from '../export-layout'
import { KIT_TILES_PARTS } from './tiles.parts'
import { KIT_TILES_LAYOUT } from './tiles.layout'
import { KIT_TRENDS_PARTS } from './trends.parts'
import { KIT_TRENDS_LAYOUT } from './trends.layout'
import { KIT_YTD_PARTS } from './ytd.parts'
import { KIT_YTD_LAYOUT } from './ytd.layout'
import { KIT_POSTS_PARTS } from './posts.parts'
import { KIT_POSTS_LAYOUT } from './posts.layout'
import { KIT_KPI_CHECK_IN_PARTS } from './kpi-check-in.parts'
import { KIT_KPI_CHECK_IN_LAYOUT } from './kpi-check-in.layout'

const SLOTS: Record<string, { parts: PartRegistry<OrganicSocialCtx>; layout: Record<string, 'own' | 'block'> }> = {
  tiles: { parts: KIT_TILES_PARTS, layout: KIT_TILES_LAYOUT },
  trends: { parts: KIT_TRENDS_PARTS, layout: KIT_TRENDS_LAYOUT },
  ytd: { parts: KIT_YTD_PARTS, layout: KIT_YTD_LAYOUT },
  posts: { parts: KIT_POSTS_PARTS, layout: KIT_POSTS_LAYOUT },
  'kpi-check-in': { parts: KIT_KPI_CHECK_IN_PARTS, layout: KIT_KPI_CHECK_IN_LAYOUT },
}
const pins = (reg: PartRegistry<OrganicSocialCtx>) => Object.entries(reg).flatMap(([id, vs]) => Object.keys(vs).map((v) => `${id}@${v}`))

describe.each(Object.entries(SLOTS))('kit slot %s', (_name, slot) => {
  test('every version it registers is unpublished, so it can never be frozen or promoted into the shared template', () => {
    for (const [id, versions] of Object.entries(slot.parts))
      for (const [v, impl] of Object.entries(versions)) expect(impl.published, `${id}@${v}`).toBe(false)
  })
  test('it never replaces a version that already exists (mergeRegistries would let it, silently)', () => {
    for (const pin of pins(slot.parts)) {
      const [id, v] = pin.split('@')
      expect(PRE_KIT_PARTS[id]?.[Number(v)], pin).toBeUndefined()
    }
  })
  test('its layout file names exactly the versions its parts file registers', () => {
    expect(Object.keys(slot.layout).sort()).toEqual(pins(slot.parts).sort())
  })
  test('the registry and the export layout carry what it registers', () => {
    for (const pin of pins(slot.parts)) {
      const [id, v] = pin.split('@')
      expect(ORGANIC_SOCIAL_PARTS[id]?.[Number(v)], pin).toBe(slot.parts[id][Number(v)])
      expect(EXPORT_LAYOUT[pin], pin).toBe(slot.layout[pin])
    }
  })
})

test('no two slots register the same version', () => {
  const all = Object.values(SLOTS).flatMap((s) => pins(s.parts))
  expect(all.length).toBe(new Set(all).size)
})

test('every version that existed before the kit is still registered, unchanged', () => {
  for (const [id, versions] of Object.entries(PRE_KIT_PARTS))
    for (const [v, impl] of Object.entries(versions)) expect(ORGANIC_SOCIAL_PARTS[id][Number(v)], `${id}@${v}`).toBe(impl)
})
