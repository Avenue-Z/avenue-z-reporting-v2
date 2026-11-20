// @vitest-environment node
// getCommentaryForViewPrefix against a real Postgres engine (PGlite, in memory): the prefix must match the analysis box
// keys only, for one client, with LIKE's wildcards in the prefix taken literally. boxes.query.test.ts pins the SQL text;
// this proves what Postgres does with it. No shared database is touched.
import { beforeAll, expect, test, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { SL_VIEW_PREFIX } from './boxes'

const h = vi.hoisted(() => ({ db: null as unknown as Record<string, unknown> }))
vi.mock('@/lib/db/client', () => ({
  db: new Proxy({}, {
    get: (_t, k) => {
      const v = h.db[k as string]
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(h.db) : v
    },
  }),
}))

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

beforeAll(async () => {
  const pg = new PGlite()
  // The columns of report_commentary as lib/db/schema.ts defines them (Drizzle selects every one).
  await pg.exec(`
    CREATE TYPE "commentary_status" AS ENUM ('draft', 'approved');
    CREATE TABLE "report_commentary" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "client_id" uuid NOT NULL, "view_key" text NOT NULL,
      "body_html" text NOT NULL, "period_start" date NOT NULL, "period_end" date NOT NULL,
      "status" "commentary_status" DEFAULT 'draft' NOT NULL, "created_by" text NOT NULL, "updated_by" text NOT NULL,
      "approved_by" text, "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
      "approved_at" timestamptz, "deleted_at" timestamptz, "deleted_by" text
    );`)
  const row = (client: string, key: string, start: string) =>
    `('${client}', '${key}', '<p>x</p>', '${start}', '${start}', 's', 's')`
  await pg.exec(`INSERT INTO "report_commentary" ("client_id","view_key","body_html","period_start","period_end","created_by","updated_by") VALUES
    ${row(A, `${SL_VIEW_PREFIX}b-kpis`, '2026-10-01')},
    ${row(A, `${SL_VIEW_PREFIX}i-keywords`, '2026-11-01')},
    ${row(A, 'organic-social:social-listening', '2026-11-01')},
    ${row(A, 'organic-social:social-listeningXb-kpis', '2026-11-01')},
    ${row(A, 'organic-social:instagram', '2026-11-01')},
    ${row(A, 'aXb:', '2026-11-01')},
    ${row(A, 'a_b:x', '2026-11-01')},
    ${row(B, `${SL_VIEW_PREFIX}b-kpis`, '2026-11-01')};`)
  const schema = await import('@/lib/db/schema')
  h.db = drizzle(pg, { schema }) as unknown as Record<string, unknown>
})

test('only this client\'s box keys, newest period first', async () => {
  const { getCommentaryForViewPrefix } = await import('@/lib/db/queries')
  const rows = await getCommentaryForViewPrefix(A, SL_VIEW_PREFIX)
  expect(rows.map((r) => r.viewKey)).toEqual([`${SL_VIEW_PREFIX}i-keywords`, `${SL_VIEW_PREFIX}b-kpis`])
})

test('an underscore in the prefix is a literal underscore, not "any character"', async () => {
  const { getCommentaryForViewPrefix } = await import('@/lib/db/queries')
  expect((await getCommentaryForViewPrefix(A, 'a_b:')).map((r) => r.viewKey)).toEqual(['a_b:x'])
})
