// Data contracts (spec v1.1 §10). contract-core's model (one declared schema per boundary, a mode per boundary, one
// log line per violation naming the boundary, field and issue, never a value; no kill switch, §19.6) applied with zod,
// because contract-core is Python. Peec boundaries enforce their numeric fields and observe every other field they read.
import { z } from 'zod'
import { CONTRACT_MODES, type ContractBoundary, type ContractMode } from './config'
import { NOTE_KINDS } from './notes'
import { PeecError } from './peec'
import { PAGE_KEYS } from './slots'

export interface ContractIssue { field: string; issue: string }
export type ContractResult = { ok: true } | { ok: false; issues: ContractIssue[] }

/** A zod path as a field name: array indexes dropped, so 10,000 rows missing one field are one field. */
const fieldOf = (path: readonly PropertyKey[]): string => path.filter((p): p is string => typeof p === 'string').join('.') || '(root)'

/** Spec v1.1 §19.6 removed the off switch. An environment that still sets it is told once per process, so a stale
 *  setting is not mistaken for a working one (Paul, #388 review). */
let switchWarned = false
function warnIfSwitchSet(): void {
  if (switchWarned || !process.env.CONTRACT_DISABLED) return
  switchWarned = true
  console.warn('[aeo-outbound] CONTRACT_DISABLED is set but ignored: AEO Outbound contracts have no off switch (spec v1.1 §19.6). Remove it from this environment.')
}

/**
 * Checks value against schema. Logs one line per distinct field and issue, with how many times it occurred, at info
 * (observe), warn (warn) or error (enforce), and never a value. Only enforce can fail.
 */
export function checkContract(boundary: ContractBoundary, schema: z.ZodType, value: unknown, mode: ContractMode = CONTRACT_MODES[boundary]): ContractResult {
  warnIfSwitchSet()
  const parsed = schema.safeParse(value)
  if (parsed.success) return { ok: true }
  const counts = new Map<string, { field: string; issue: string; n: number }>()
  for (const i of parsed.error.issues) {
    const field = fieldOf(i.path)
    const key = `${field}\u0000${i.code}`
    const seen = counts.get(key)
    if (seen) seen.n++
    else counts.set(key, { field, issue: i.code, n: 1 })
  }
  const log = mode === 'observe' ? console.info : mode === 'warn' ? console.warn : console.error
  for (const c of counts.values()) log(`[aeo-outbound] contract boundary=${boundary} field=${c.field} issue=${c.issue} count=${c.n} mode=${mode}`)
  return mode === 'enforce' ? { ok: false, issues: [...counts.values()].map(({ field, issue }) => ({ field, issue })) } : { ok: true }
}

const count = z.number().int().nonnegative().nullish()
const ratio = z.number().min(0).max(1)

/** Only the fields pull.ts reads. looseObject passes every other field through untouched. Spec v1.1 §19.6: every field a
 *  number on the page depends on is enforced (measured on 6,000 live domain rows and 206 roster rows on 2026-10-14). */
export const PEEC_CONTRACTS = {
  'peec.projects': { observe: z.array(z.looseObject({ id: z.union([z.string(), z.number()]), name: z.string().nullish(), status: z.string().nullish() })) },
  // The roster decides the own brand, the competitors, the rank set and the own and roster domains.
  'peec.brands': { enforce: z.array(z.looseObject({ id: z.string(), name: z.string(), is_own: z.boolean(), domains: z.array(z.string()).nullish() })), observe: z.unknown() },
  'peec.project_profile': {
    observe: z.looseObject({
      profile: z.looseObject({ industry: z.string().nullish(), target_markets: z.array(z.looseObject({ location: z.string().nullish() })).nullish() }).nullish(),
    }).nullable(),
  },
  // The date decides the window the page states.
  'peec.domains_by_date': {
    enforce: z.array(z.looseObject({ retrieved_chat_count: count, date: z.string().regex(/^\d{4}-\d{2}-\d{2}/) })),
    observe: z.array(z.looseObject({ domain: z.string() })),
  },
  // The brand's name is printed in the sentences, and its id ranks it (final review M2).
  'peec.brands_report': {
    enforce: z.array(z.looseObject({ brand: z.looseObject({ id: z.string(), name: z.string() }), visibility: ratio, share_of_voice: ratio.nullish(), position: z.number().nonnegative().nullish() })),
    observe: z.unknown(),
  },
  'peec.brands_by_model': {
    enforce: z.array(z.looseObject({ visibility_total: count })),
    observe: z.array(z.looseObject({ brand: z.looseObject({ id: z.string() }), model_channel: z.looseObject({ id: z.string() }).nullish() })),
  },
  'peec.model_channels': { observe: z.array(z.looseObject({ id: z.string(), description: z.string().nullish() })) },
  // classification decides the source mix and the donut (Peec also sends custom names, so any non-empty string);
  // mentioned_brands decides the competitor domain gaps (often an empty array); the domain is printed in the sentences.
  'peec.domains_report': {
    enforce: z.array(z.looseObject({ domain: z.string().min(1), retrieved_chat_count: count, retrieval_count: count, usage_rate: z.number().min(0), retrieved_percentage: ratio.nullish(), classification: z.string().min(1), mentioned_brands: z.array(z.looseObject({ id: z.string() })) })),
    observe: z.unknown(),
  },
  'peec.actions': { observe: z.array(z.looseObject({ title: z.string().nullish(), impact: z.string().nullish(), type: z.string().nullish(), status: z.string().nullish() })) },
  'peec.prompts': { enforce: z.looseObject({ total_count: count }).nullable(), observe: z.unknown() },
} satisfies Record<string, { observe: z.ZodType; enforce?: z.ZodType }>
export type PeecBoundary = keyof typeof PEEC_CONTRACTS

/**
 * Checks one Peec response and returns it unchanged. Observed fields only log. An enforced field that breaks its rule
 * throws a PeecError whose message is "<boundary>.<field>" and whose code is contract_violation, so the generation
 * fails with that reason instead of publishing a wrong number. There is no off switch (spec v1.1 §19.6).
 */
export function peecContract<T>(boundary: PeecBoundary, value: T): T {
  const c: { observe: z.ZodType; enforce?: z.ZodType } = PEEC_CONTRACTS[boundary]
  checkContract(boundary, c.observe, value, 'observe')
  if (c.enforce) {
    const r = checkContract(boundary, c.enforce, value, CONTRACT_MODES[boundary])
    if (!r.ok) throw new PeecError(`${boundary}.${r.issues[0].field}`, false, false, 'contract_violation')
  }
  return value
}

/** A report id: the same shape store.ts checks before any query reaches Postgres. */
export const REPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const copyText = z.string().min(1)
/** The Glean reply's shape (spec §6; v1.1 §19.2: code writes the context, both boxes and the methodology, so any of those
 *  keys Glean still sends are ignored). validateGeneratedSlots still cleans and length-checks every value afterwards. */
export const GLEAN_SLOTS = z.looseObject({
  headline: copyText, summary: copyText,
  why: copyText, opportunities: z.array(z.looseObject({ signal: copyText, opportunity: copyText, workstream: copyText })).length(3),
  // validateGeneratedSlots owns next_step and enforces it only when no fixed sentence is set.
  next_step: z.unknown().optional(),
})
/** POST /api/aeo-outbound/generate. start and end are checked by checkRange (range.ts), which owns their messages. */
export const GENERATE_BODY = z.looseObject({ projectId: z.string().min(1), rerunOf: z.string().regex(REPORT_ID_RE).nullish() })
/** A save's writer (the editor queue's UUID) and seq (the item's send order), spec v1.1 18.4. The slots route's structural
 *  guard checks the same two schemas as well. */
export const SAVE_WRITER = z.uuid()
export const SAVE_SEQ = z.number().int().min(1).max(2147483647)
/** PATCH /api/aeo-outbound/reports/{id}/slots. path and value are checked by slots.ts, which owns their messages.
 *  writer and seq are optional, both or neither. */
export const SLOTS_BODY = z.looseObject({ path: z.string(), value: z.unknown(), revision: z.number().int(), writer: SAVE_WRITER.optional(), seq: SAVE_SEQ.optional() })
  .refine((b) => (b.writer === undefined) === (b.seq === undefined), { path: ['seq'], message: 'writer and seq go together' })

/** A free-text name setting: 1 to 60 characters, not blank, no U+2013 or U+2014. A refine, not .trim(), so a read returns the stored text unchanged. */
const settingsName = z.string().min(1).max(60).refine((v) => v.trim().length > 0 && !/[\u2013\u2014]/.test(v))

/** The settings row as Drizzle reads it (spec v1.1 §8 limits). A failure falls back to the config.ts defaults. */
export const SETTINGS_ROW = z.looseObject({
  users: z.array(z.string()).max(50),
  admins: z.array(z.string()).max(50),
  sectionTitles: z.array(z.string().min(1).max(60)).length(2),
  fixedNextStep: z.string().min(1).max(300).nullable(),
  rankAmong: z.number().int().min(2).max(50).nullable(),
  peecOpportunityRows: z.number().int().min(0).max(3),
  methodologyStatesPromptsAndModels: z.boolean(),
  sidebarWordmark: settingsName,
  series: settingsName,
  updatedAt: z.date(),
})

const storedKpi = z.looseObject({ label: z.string(), value: z.string() })
const storedBrand = z.looseObject({ id: z.string(), name: z.string(), isOwn: z.boolean(), visibilityPct: z.number(), sovPct: z.number().nullable(), position: z.number().nullable(), rank: z.number() })
/** A row's notes: v1 strings or v1.1 Notes (spec v1.1 §4). */
export const STORED_NOTES = z.array(z.union([z.string(), z.looseObject({ kind: z.enum(NOTE_KINDS), path: z.string().optional(), text: z.string() })]))
/** Stored data, version 1 or 2 (v1.1 §10). Only the fields render, grounding and the editor read. */
export const STORED_DATA = z.looseObject({
  schemaVersion: z.literal(2).optional(),
  projectId: z.string(), projectName: z.string(), brand: z.string(), generatedAt: z.string(),
  window: z.looseObject({ start: z.string(), end: z.string() }), windowLabel: z.string(),
  category: z.string().nullable(), market: z.string().nullable(),
  brands: z.array(storedBrand), own: storedBrand, kpis: z.array(storedKpi),
  competitorsTracked: z.number(), rankN: z.number(),
  leaderGaps: z.array(z.looseObject({ name: z.string(), visibilityPoints: z.number(), sovPoints: z.number().nullable() })),
  ownDomains: z.array(z.string()), ownRetrievedChats: z.number(), ownRetrievedPct: z.number().nullable(),
  sourceMix: z.array(z.looseObject({ label: z.string(), weight: z.number(), pct: z.number() })),
  gapDomains: z.array(z.looseObject({ domain: z.string(), retrievedChats: z.number() })),
  actions: z.array(z.looseObject({ title: z.string(), impact: z.string(), type: z.string() })),
  promptCount: z.number().nullable(), models: z.array(z.string()), notes: STORED_NOTES,
  // Spec v1.1 §19.5: on rows generated with code-written sentences; absent on older rows.
  sentences: z.number().int().min(1).optional(),
  ownSiteRank: z.number().int().min(1).nullable().optional(),
  noDataBrands: z.array(z.string()).optional(),
  // 2026-10-19 Peec parity: the source-mix weighting a row was generated with; absent on older rows (retrieval_count).
  sourceMixWeight: z.enum(['retrieval_count', 'retrieved_chat_count', 'usage_rate']).optional(),
})
const storedBullet = z.looseObject({ lead: z.string(), text: z.string() })
/** Stored slots: the copy keys always, the v1.1 keys when the row has them. */
export const STORED_SLOTS = z.looseObject({
  category: z.string(), market: z.string(), headline: z.string(), summary: z.string(), context: z.string(),
  // Spec v1.1 18.12: Ryan keeps 1 to 6 per box, so every older row of 2 or 3 still reads.
  competitive_bullets: z.array(storedBullet).min(1).max(6), sources_bullets: z.array(storedBullet).min(1).max(6),
  why: z.string(), opportunities: z.array(z.looseObject({ signal: z.string(), opportunity: z.string(), workstream: z.string() })).length(3),
  methodology: z.string(), next_step: z.string(),
  brand: z.string().optional(), window_label: z.string().optional(), kpis: z.array(storedKpi).optional(),
  page: z.partialRecord(z.enum(PAGE_KEYS), z.string()).optional(),
})
