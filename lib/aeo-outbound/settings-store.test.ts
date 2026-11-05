import { expect, test, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { readSettingsRowQuery, recentSettingsLogQuery, saveSettingsSql, type SettingsValues } from './settings-store'

const V: SettingsValues = {
  users: ['ana@avenuez.com'], admins: [], sectionTitles: ['Category data', 'Competitive visibility'], fixedNextStep: null,
  rankAmong: 7, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx', series: 'AEO Lens Report',
}
const CHANGES = [{ field: 'users', oldValue: [], newValue: ['ana@avenuez.com'] }, { field: 'rankAmong', oldValue: null, newValue: 7 }]
const NOW = new Date('2026-10-11T12:00:00Z')
const LOG = ' insert into "aeo_outbound_settings_log" ("changed_at", "changed_by", "field", "old_value", "new_value") select '

test('the settings read is the single row by its true key', () => {
  const q = readSettingsRowQuery().toSQL()
  expect(q.sql).toBe('select "id", "users", "admins", "section_titles", "fixed_next_step", "rank_among", "peec_opportunity_rows", "methodology_states_prompts_and_models", "sidebar_wordmark", "series", "updated_at", "updated_by" from "aeo_outbound_settings" where "aeo_outbound_settings"."id" = $1 limit $2')
  expect(q.params).toEqual([true, 1])
})

test('a first save inserts the row and its log entries in one statement, and does nothing if a row appeared meanwhile', () => {
  const q = new PgDialect().sqlToQuery(saveSettingsSql(V, CHANGES, 'admin@avenuez.com', NOW, null))
  expect(q.sql.startsWith('with "s" as (insert into "aeo_outbound_settings" ("id", "users", "admins", "section_titles", "fixed_next_step", "rank_among", "peec_opportunity_rows", "methodology_states_prompts_and_models", "sidebar_wordmark", "series", "updated_at", "updated_by") values (true, $1::jsonb, $2::jsonb, $3::jsonb, $4::text, $5::integer, $6::integer, $7::boolean, $8::text, $9::text, $10::timestamptz, $11::text) on conflict ("id") do nothing returning "id")')).toBe(true)
  expect(q.sql).toContain(`)${LOG}$12::timestamptz, $13::text, "v"."field", "v"."old_value", "v"."new_value" from "s", (values ($14::text, $15::jsonb, $16::jsonb), ($17::text, $18::jsonb, $19::jsonb)) as "v"("field", "old_value", "new_value") returning "id"`)
  expect(q.params).toEqual(['["ana@avenuez.com"]', '[]', '["Category data","Competitive visibility"]', null, 7, 1, true, 'AIVx', 'AEO Lens Report', NOW.toISOString(), 'admin@avenuez.com',
    NOW.toISOString(), 'admin@avenuez.com', 'users', '[]', '["ana@avenuez.com"]', 'rankAmong', 'null', '7'])
})

test('a later save matches the updated_at the editor loaded, so a concurrent save matches nothing', () => {
  const q = new PgDialect().sqlToQuery(saveSettingsSql(V, CHANGES, 'admin@avenuez.com', NOW, '2026-10-10T09:00:00.000Z'))
  expect(q.sql).toContain('"series" = $9::text, "updated_at" = $10::timestamptz, "updated_by" = $11::text where "id" = true and date_trunc(\'milliseconds\', "updated_at") = $12::timestamptz returning "id")')
  expect(q.sql).toContain('"sidebar_wordmark" = $8::text, "series" = $9::text')
  expect(q.params[8]).toBe('AEO Lens Report')
  expect(q.params[11]).toBe('2026-10-10T09:00:00.000Z')
})

test('a save with no changes is refused before any SQL', () => {
  expect(() => saveSettingsSql(V, [], 'admin@avenuez.com', NOW, null)).toThrow('saveSettingsSql needs at least one change')
})

test('saveSettings is true when the write matched and false when it did not', async () => {
  vi.resetModules()
  const execute = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'x' }, { id: 'y' }] }).mockResolvedValueOnce({ rows: [] })
  vi.doMock('@/lib/db/client', () => ({ db: { execute } }))
  try {
    const store = await import('./settings-store')
    expect(await store.saveSettings(V, CHANGES, 'admin@avenuez.com', NOW, null)).toBe(true)
    expect(await store.saveSettings(V, CHANGES, 'admin@avenuez.com', NOW, '2026-10-10T09:00:00.000Z')).toBe(false)
  } finally {
    vi.doUnmock('@/lib/db/client')
    vi.resetModules()
  }
})

test('the log read is newest first', () => {
  const q = recentSettingsLogQuery(20).toSQL()
  expect(q.sql).toBe('select "changed_at", "changed_by", "field" from "aeo_outbound_settings_log" order by "aeo_outbound_settings_log"."changed_at" desc limit $1')
  expect(q.params).toEqual([20])
})
