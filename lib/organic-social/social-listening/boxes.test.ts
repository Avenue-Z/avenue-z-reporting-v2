import { describe, expect, test } from 'vitest'
import { SL_BOX_IDS, SL_BRAND_BOX_IDS, SL_INDUSTRY_BOX_IDS, SL_VIEW_PREFIX, slBoxLabels, slBoxViewKey } from './boxes'
import { ANALYSIS_LABELS, KEYWORD_LABELS } from '@/lib/commentary/labels'
import { COMMENTARY_VIEWS, isCommentaryViewKey, recommendationsViewKeyFor } from '@/lib/commentary/views'
import { isOrganicSocialViewKey } from '@/lib/commentary/month'

// Spec section 9, verbatim and in page order.
const BRAND = 'b-kpis b-daily b-sent b-owned b-cross b-ytd b-posneu b-reddit b-media b-themes b-trends b-conv b-authors b-posts b-takeaways b-keywords'.split(' ')
const INDUSTRY = 'i-kpis i-daily i-sent i-ytd i-sentday i-cross i-themes i-conv i-takeaways i-keywords'.split(' ')

describe('the box ids', () => {
  test('are the spec section 9 list, 16 brand then 10 industry, 26 in all', () => {
    expect([...SL_BRAND_BOX_IDS]).toEqual(BRAND)
    expect([...SL_INDUSTRY_BOX_IDS]).toEqual(INDUSTRY)
    expect([...SL_BOX_IDS]).toEqual([...BRAND, ...INDUSTRY])
    expect(new Set(SL_BOX_IDS).size).toBe(26)
  })

  test('each view key is the shared prefix plus the id, under Organic Social', () => {
    expect(SL_VIEW_PREFIX).toBe('organic-social:social-listening:')
    for (const id of SL_BOX_IDS) {
      const k = slBoxViewKey(id)
      expect(k).toBe(`organic-social:social-listening:${id}`)
      expect(isOrganicSocialViewKey(k)).toBe(true)
    }
  })
})

describe('the registry', () => {
  test('every box key has an entry the write-path guard accepts, owned by Savannah / Jasmine', () => {
    for (const id of SL_BOX_IDS) {
      const k = slBoxViewKey(id)
      expect(isCommentaryViewKey(k)).toBe(true)
      expect(COMMENTARY_VIEWS[k].owner).toBe('Savannah / Jasmine')
      expect(COMMENTARY_VIEWS[k].label).toMatch(/^Social Listening, (Brand|Industry) \S/)
    }
  })

  test('labels are unique, so the history log can tell the boxes apart', () => {
    const labels = SL_BOX_IDS.map((id) => COMMENTARY_VIEWS[slBoxViewKey(id)].label)
    expect(new Set(labels).size).toBe(SL_BOX_IDS.length)
  })

  test('labels carry no em or en dash', () => {
    for (const id of SL_BOX_IDS) expect(COMMENTARY_VIEWS[slBoxViewKey(id)].label).not.toMatch(/[–—]/)
  })

  test('no box gets a Recommendations key', () => {
    for (const id of SL_BOX_IDS) expect(recommendationsViewKeyFor(slBoxViewKey(id))).toBeNull()
  })

  test('the bare prefix and an unknown id are not view keys', () => {
    expect(isCommentaryViewKey('organic-social:social-listening')).toBe(false)
    expect(isCommentaryViewKey(SL_VIEW_PREFIX)).toBe(false)
    expect(isCommentaryViewKey(`${SL_VIEW_PREFIX}b-nope`)).toBe(false)
  })
})

describe('the box labels', () => {
  test('the two keyword boxes use the keyword labels, every other box the analysis labels', () => {
    for (const id of SL_BOX_IDS) {
      expect(slBoxLabels(id)).toBe(id === 'b-keywords' || id === 'i-keywords' ? KEYWORD_LABELS : ANALYSIS_LABELS)
    }
  })
})
