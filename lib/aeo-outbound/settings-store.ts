// The only reader and writer of aeo_outbound_settings and aeo_outbound_settings_log (spec v1.1 §8). A save is one
// statement: the settings write and its log rows together, guarded by the updated_at the editor loaded, so a second
// concurrent save matches nothing and is told to reload.
import { desc, eq, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aeoOutboundSettings as s, aeoOutboundSettingsLog as log, type AeoOutboundSettingsRow } from '@/lib/db/schema'

export interface SettingsValues {
  users: string[]
  admins: string[]
  sectionTitles: [string, string]
  fixedNextStep: string | null
  rankAmong: number | null
  peecOpportunityRows: number
  methodologyStatesPromptsAndModels: boolean
  sidebarWordmark: 'AIVx' | 'Avenue Z'
}
export interface SettingsChange { field: string; oldValue: unknown; newValue: unknown }

export function readSettingsRowQuery() {
  return db.select().from(s).where(eq(s.id, true)).limit(1)
}

/** The settings row, or null when none was ever saved. */
export async function readSettingsRow(): Promise<AeoOutboundSettingsRow | null> {
  return (await readSettingsRowQuery())[0] ?? null
}

/** expectedUpdatedAt null means the editor saw no row: insert, and do nothing if one appeared meanwhile. */
export function saveSettingsSql(v: SettingsValues, changes: SettingsChange[], by: string, now: Date, expectedUpdatedAt: string | null): SQL {
  if (!changes.length) throw new Error('saveSettingsSql needs at least one change')
  const at = now.toISOString()
  const j = (x: unknown) => JSON.stringify(x)
  const write = expectedUpdatedAt === null
    ? sql`insert into "aeo_outbound_settings" ("id", "users", "admins", "section_titles", "fixed_next_step", "rank_among", "peec_opportunity_rows", "methodology_states_prompts_and_models", "sidebar_wordmark", "updated_at", "updated_by") values (true, ${j(v.users)}::jsonb, ${j(v.admins)}::jsonb, ${j(v.sectionTitles)}::jsonb, ${v.fixedNextStep}::text, ${v.rankAmong}::integer, ${v.peecOpportunityRows}::integer, ${v.methodologyStatesPromptsAndModels}::boolean, ${v.sidebarWordmark}::text, ${at}::timestamptz, ${by}::text) on conflict ("id") do nothing returning "id"`
    : sql`update "aeo_outbound_settings" set "users" = ${j(v.users)}::jsonb, "admins" = ${j(v.admins)}::jsonb, "section_titles" = ${j(v.sectionTitles)}::jsonb, "fixed_next_step" = ${v.fixedNextStep}::text, "rank_among" = ${v.rankAmong}::integer, "peec_opportunity_rows" = ${v.peecOpportunityRows}::integer, "methodology_states_prompts_and_models" = ${v.methodologyStatesPromptsAndModels}::boolean, "sidebar_wordmark" = ${v.sidebarWordmark}::text, "updated_at" = ${at}::timestamptz, "updated_by" = ${by}::text where "id" = true and "updated_at" = ${expectedUpdatedAt}::timestamptz returning "id"`
  const rows = sql.join(changes.map((c) => sql`(${c.field}::text, ${j(c.oldValue)}::jsonb, ${j(c.newValue)}::jsonb)`), sql`, `)
  return sql`with "s" as (${write}) insert into "aeo_outbound_settings_log" ("changed_at", "changed_by", "field", "old_value", "new_value") select ${at}::timestamptz, ${by}::text, "v"."field", "v"."old_value", "v"."new_value" from "s", (values ${rows}) as "v"("field", "old_value", "new_value") returning "id"`
}

/** True when the save landed (one log row per change came back); false when another save got there first. */
export async function saveSettings(v: SettingsValues, changes: SettingsChange[], by: string, now: Date, expectedUpdatedAt: string | null): Promise<boolean> {
  const res = await db.execute(saveSettingsSql(v, changes, by, now, expectedUpdatedAt))
  return res.rows.length > 0
}

export function recentSettingsLogQuery(limit: number) {
  return db.select({ changedAt: log.changedAt, changedBy: log.changedBy, field: log.field }).from(log).orderBy(desc(log.changedAt)).limit(limit)
}
