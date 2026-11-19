// monthlyCommentary's optional pre-fetched `entries` (spec section 9): the Social Listening page reads every analysis
// box's rows in one prefix query and hands each box its rows, so no box queries on its own. Without `entries` the box
// reads its own view exactly as before.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { CommentaryEntry } from '@/lib/commentary/types'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { ANALYSIS_LABELS } from '@/lib/commentary/labels'
import { SL_BOX_IDS, slBoxLabels, slBoxViewKey } from '@/lib/organic-social/social-listening/boxes'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { firstOf, lastOf } from '@/lib/organic-social/reporting-months'

const panels = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }))
vi.mock('./commentary-panel', () => ({
  CommentaryPanel: (props: Record<string, unknown>) => { panels.props.push(props); return null },
}))

const q = vi.hoisted(() => ({ byKey: {} as Record<string, unknown[]>, calls: [] as string[] }))
vi.mock('@/lib/db/queries', () => ({
  getCommentaryForView: async (_clientId: string, viewKey: string) => { q.calls.push(viewKey); return q.byKey[viewKey] ?? [] },
}))

const CLIENT = { id: 'c1', slug: 'acme', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }
const STAFF = { role: 'INTERNAL_ADMIN', email: 'staff@avenuez.com' }

/** The month the team is served right now, worked out the way monthlyCommentary does. */
function servedMonth(): string {
  return lockedRangeFor(CLIENT, STAFF.role, undefined, requestClock())!.month!.key
}

function entry(id: string, viewKey: CommentaryViewKey, month: string): CommentaryEntry {
  return {
    id, viewKey, bodyHtml: `<p>${id}</p>`, periodStart: firstOf(month), periodEnd: lastOf(month), status: 'approved',
    updatedBy: 'staff@avenuez.com', updatedAt: '2026-11-02T00:00:00.000Z', approvedBy: 'staff@avenuez.com',
    approvedAt: '2026-11-03T00:00:00.000Z', deletedAt: null, deletedBy: null,
  }
}

async function box(viewKey: CommentaryViewKey, entries?: CommentaryEntry[]) {
  const { monthlyCommentary } = await import('./monthly')
  const el = await monthlyCommentary({
    client: CLIENT, role: STAFF.role, email: STAFF.email, viewKey, requestedRange: undefined, labels: ANALYSIS_LABELS,
    ...(entries ? { entries } : {}),
  })
  if (el) render(el)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'))
  panels.props = []
  vi.stubEnv('COMMENTARY_APPROVERS', STAFF.email)
  q.byKey = {}
  q.calls = []
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('monthlyCommentary with pre-fetched entries', () => {
  test('makes no query, and each box gets only its own rows', async () => {
    const m = servedMonth()
    const all = SL_BOX_IDS.map((id) => entry(`row-${id}`, slBoxViewKey(id), m))
    for (const id of SL_BOX_IDS) await box(slBoxViewKey(id), all)
    expect(q.calls).toEqual([])
    expect(panels.props).toHaveLength(SL_BOX_IDS.length)
    SL_BOX_IDS.forEach((id, i) => {
      const p = panels.props[i]
      expect(p.viewKey).toBe(slBoxViewKey(id))
      expect((p.entries as CommentaryEntry[]).map((e) => e.id)).toEqual([`row-${id}`])
      expect(p.initialId).toBe(`row-${id}`)
      // History is approver-only (the viewer is one here): it holds this box's row and no other box's.
      const history = JSON.stringify(p.history)
      expect(history).toContain(`row-${id}`)
      expect(SL_BOX_IDS.filter((o) => o !== id && history.includes(`"row-${o}"`))).toEqual([])
    })
  })

  test('an empty list is still pre-fetched: no query, an empty box for staff', async () => {
    await box(slBoxViewKey('b-kpis'), [])
    expect(q.calls).toEqual([])
    expect(panels.props).toHaveLength(1)
    expect(panels.props[0].entries).toEqual([])
  })

  test('the box labels pass through unchanged', async () => {
    const { monthlyCommentary } = await import('./monthly')
    const el = await monthlyCommentary({
      client: CLIENT, role: STAFF.role, email: STAFF.email, viewKey: slBoxViewKey('i-keywords'), requestedRange: undefined,
      labels: slBoxLabels('i-keywords'), entries: [],
    })
    render(el!)
    expect(panels.props[0].labels).toEqual(slBoxLabels('i-keywords'))
  })
})

describe('monthlyCommentary without entries (every existing caller)', () => {
  test('reads its own view once, exactly as before', async () => {
    const m = servedMonth()
    q.byKey['organic-social:instagram'] = [entry('ig', 'organic-social:instagram', m)]
    await box('organic-social:instagram')
    expect(q.calls).toEqual(['organic-social:instagram'])
    expect((panels.props[0].entries as CommentaryEntry[]).map((e) => e.id)).toEqual(['ig'])
  })
})
