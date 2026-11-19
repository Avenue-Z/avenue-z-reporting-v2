// The one read every analysis box shares (spec section 9): getCommentaryForViewPrefix. The database is replaced by a
// recorder so the test sees the exact SQL Drizzle would send, with no connection.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { SL_VIEW_PREFIX } from './boxes'

const rec = vi.hoisted(() => ({ calls: 0, where: null as unknown, rows: [] as unknown[] }))
vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (w: unknown) => {
          rec.calls += 1
          rec.where = w
          return { orderBy: async () => rec.rows }
        },
      }),
    }),
  },
}))

const row = (id: string, viewKey: string) => ({
  id, clientId: 'c1', viewKey, bodyHtml: '<p>x</p>', periodStart: '2026-10-01', periodEnd: '2026-10-31',
  status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com', approvedBy: 'b@avenuez.com',
  createdAt: new Date('2026-11-02T00:00:00Z'), updatedAt: new Date('2026-11-02T00:00:00Z'),
  approvedAt: new Date('2026-11-03T00:00:00Z'), deletedAt: null, deletedBy: null,
})

const render = (w: unknown) => new PgDialect().sqlToQuery(w as SQL)

beforeEach(() => { rec.calls = 0; rec.where = null; rec.rows = [] })

describe('getCommentaryForViewPrefix', () => {
  test('one query, scoped to the client and to keys starting with the prefix', async () => {
    const { getCommentaryForViewPrefix } = await import('@/lib/db/queries')
    await getCommentaryForViewPrefix('c1', SL_VIEW_PREFIX)
    expect(rec.calls).toBe(1)
    const q = render(rec.where)
    expect(q.sql).toMatch(/"client_id" = \$1/)
    expect(q.sql).toMatch(/"view_key" like \$2/)
    expect(q.params).toEqual(['c1', 'organic-social:social-listening:%'])
  })

  test('LIKE wildcards in the prefix are escaped, so it matches only itself', async () => {
    const { getCommentaryForViewPrefix } = await import('@/lib/db/queries')
    await getCommentaryForViewPrefix('c1', 'a_b%c\\d:')
    expect(render(rec.where).params[1]).toBe('a\\_b\\%c\\\\d:%')
  })

  test('maps rows to commentary entries, as getCommentaryForView does', async () => {
    rec.rows = [row('r1', `${SL_VIEW_PREFIX}b-kpis`)]
    const { getCommentaryForViewPrefix } = await import('@/lib/db/queries')
    const out = await getCommentaryForViewPrefix('c1', SL_VIEW_PREFIX)
    expect(out).toEqual([{
      id: 'r1', viewKey: `${SL_VIEW_PREFIX}b-kpis`, bodyHtml: '<p>x</p>', periodStart: '2026-10-01', periodEnd: '2026-10-31',
      status: 'approved', updatedBy: 'a@avenuez.com', updatedAt: '2026-11-02T00:00:00.000Z', approvedBy: 'b@avenuez.com',
      approvedAt: '2026-11-03T00:00:00.000Z', deletedAt: null, deletedBy: null,
    }])
  })

  test('an empty prefix is refused, so it can never read every view of a client', async () => {
    const { getCommentaryForViewPrefix } = await import('@/lib/db/queries')
    await expect(getCommentaryForViewPrefix('c1', '')).rejects.toThrow(/prefix/)
    expect(rec.calls).toBe(0)
  })
})
