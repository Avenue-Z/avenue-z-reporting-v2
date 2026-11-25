import { describe, expect, it } from 'vitest'
import { buildChecklist, publishWarnings } from './checklist'

const base = { commentary: 'none' as const, status: 'draft' as const }

describe('buildChecklist', () => {
  it('marks missing GSC uploads as todo and failed Ahrefs as problem with its reason', () => {
    const items = buildChecklist({
      ...base,
      runs: [
        { source: 'sf', status: 'complete' },
        { source: 'ahrefs', status: 'failed', lastError: 'Ahrefs project not found' },
      ],
    })
    expect(items.find((i) => i.key === 'sf')?.state).toBe('done')
    const ahrefs = items.find((i) => i.key === 'ahrefs')
    expect(ahrefs).toMatchObject({ state: 'problem', detail: 'Ahrefs project not found' })
    const indexing = items.find((i) => i.key === 'gsc_indexing')
    expect(indexing).toMatchObject({
      label: 'Upload GSC Page indexing', state: 'todo',
      detail: 'Search Console → Indexing → Pages → All known pages → Export → Download Excel; upload the .xlsx',
    })
    expect(items.find((i) => i.key === 'gsc_cwv_mobile')?.label).toBe('Upload GSC Core Web Vitals — mobile')
    expect(items.map((i) => i.key).slice(-2)).toEqual(['review', 'commentary'])
  })

  it('tracks commentary and review state', () => {
    const items = buildChecklist({ runs: [], commentary: 'approved', status: 'published' })
    expect(items.find((i) => i.key === 'commentary')?.state).toBe('done')
    expect(items.find((i) => i.key === 'review')?.state).toBe('done')
    const draft = buildChecklist({ runs: [], commentary: 'draft', status: 'draft' })
    expect(draft.find((i) => i.key === 'commentary')).toMatchObject({ state: 'todo', detail: 'Draft, not approved yet' })
  })
})

describe('publishWarnings', () => {
  it('lists each missing GSC slot', () => {
    const items = buildChecklist({ ...base, runs: [{ source: 'gsc_indexing', status: 'complete' }] })
    expect(publishWarnings(items)).toEqual([
      'GSC Core Web Vitals — mobile is missing',
      'GSC Core Web Vitals — desktop is missing',
    ])
  })
  it('is empty when every slot is in', () => {
    const runs = (['gsc_indexing', 'gsc_cwv_mobile', 'gsc_cwv_desktop'] as const).map((source) => ({ source, status: 'complete' as const }))
    expect(publishWarnings(buildChecklist({ ...base, runs }))).toEqual([])
  })
})
