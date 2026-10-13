// Data contracts (spec v1.1 §10). contract-core's model (one declared schema per boundary, a mode per boundary, one
// log line per violation naming the boundary, field and issue, never a value, and a kill switch) applied with zod,
// because contract-core is Python. Peec boundaries enforce their numeric fields and observe every other field they read.
import { z } from 'zod'
import { CONTRACT_MODES, type ContractBoundary, type ContractMode } from './config'
import { NOTE_KINDS } from './notes'
import { PeecError } from './peec'
import { PAGE_KEYS } from './slots'

export interface ContractIssue { field: string; issue: string }
export type ContractResult = { ok: true } | { ok: false; issues: ContractIssue[] }
type Env = Record<string, string | undefined>

/** CONTRACT_DISABLED set to anything but empty, 0 or false turns every check off. */
export function contractsDisabled(env: Env = process.env): boolean {
  const v = (env.CONTRACT_DISABLED ?? '').trim().toLowerCase()
  return v !== '' && v !== '0' && v !== 'false'
}

/** A zod path as a field name: array indexes dropped, so 10,000 rows missing one field are one field. */
const fieldOf = (path: readonly PropertyKey[]): string => path.filter((p): p is string => typeof p === 'string').join('.') || '(root)'

/**
 * Checks value against schema. Logs one line per distinct field and issue, with how many times it occurred, at info
 * (observe), warn (warn) or error (enforce), and never a value. Only enforce can fail.
 */
export function checkContract(boundary: ContractBoundary, schema: z.ZodType, value: unknown, mode: ContractMode = CONTRACT_MODES[boundary], env: Env = process.env): ContractResult {
  if (contractsDisabled(env)) return { ok: true }
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

/** Only the fields pull.ts reads. looseObject passes every other field through untouched. */
export const PEEC_CONTRACTS = {
  'peec.projects': { observe: z.array(z.looseObject({ id: z.union([z.string(), z.number()]), name: z.string().nullish(), status: z.string().nullish() })) },
  'peec.brands': { observe: z.array(z.looseObject({ id: z.string(), name: z.string(), is_own: z.boolean(), domains: z.array(z.string()).nullish() })) },
  'peec.project_profile': {
    observe: z.looseObject({
      profile: z.looseObject({ industry: z.string().nullish(), target_markets: z.array(z.looseObject({ location: z.string().nullish() })).nullish() }).nullish(),
    }).nullable(),
  },
  'peec.domains_by_date': {
    enforce: z.array(z.looseObject({ retrieved_chat_count: count })),
    observe: z.array(z.looseObject({ domain: z.string(), date: z.string() })),
  },
  'peec.brands_report': {
    enforce: z.array(z.looseObject({ visibility: ratio, share_of_voice: ratio.nullish(), position: z.number().nonnegative().nullish() })),
    observe: z.array(z.looseObject({ brand: z.looseObject({ id: z.string(), name: z.string() }) })),
  },
  'peec.brands_by_model': {
    enforce: z.array(z.looseObject({ visibility_total: count })),
    observe: z.array(z.looseObject({ brand: z.looseObject({ id: z.string() }), model_channel: z.looseObject({ id: z.string() }).nullish() })),
  },
  'peec.model_channels': { observe: z.array(z.looseObject({ id: z.string(), description: z.string().nullish() })) },
  'peec.domains_report': {
    enforce: z.array(z.looseObject({ retrieved_chat_count: count, retrieval_count: count, retrieved_percentage: ratio.nullish() })),
    observe: z.array(z.looseObject({ domain: z.string(), classification: z.string().nullish(), mentioned_brands: z.array(z.looseObject({ id: z.string() })).nullish() })),
  },
  'peec.actions': { observe: z.array(z.looseObject({ title: z.string().nullish(), impact: z.string().nullish(), type: z.string().nullish(), status: z.string().nullish() })) },
  'peec.prompts': { enforce: z.looseObject({ total_count: count }).nullable(), observe: z.unknown() },
} satisfies Record<string, { observe: z.ZodType; enforce?: z.ZodType }>
export type PeecBoundary = keyof typeof PEEC_CONTRACTS

/**
 * Checks one Peec response and returns it unchanged. Observed fields only log. An enforced field that breaks its rule
 * throws a PeecError whose message is "<boundary>.<field>" and whose code is contract_violation, so the generation
 * fails with that reason instead of publishing a wrong number.
 */
export function peecContract<T>(boundary: PeecBoundary, value: T, env: Env = process.env): T {
  const c: { observe: z.ZodType; enforce?: z.ZodType } = PEEC_CONTRACTS[boundary]
  checkContract(boundary, c.observe, value, 'observe', env)
  if (c.enforce) {
    const r = checkContract(boundary, c.enforce, value, CONTRACT_MODES[boundary], env)
    if (!r.ok) throw new PeecError(`${boundary}.${r.issues[0].field}`, false, false, 'contract_violation')
  }
  return value
}

/** A report id: the same shape store.ts checks before any query reaches Postgres. */
export const REPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const copyText = z.string().min(1)
const bullet = z.looseObject({ lead: copyText, text: copyText })
/** The Glean reply's shape (spec §6). validateGeneratedSlots still cleans and length-checks every value afterwards. */
export const GLEAN_SLOTS = z.looseObject({
  headline: copyText, summary: copyText, context: copyText,
  competitive_bullets: z.array(bullet).min(2).max(3), sources_bullets: z.array(bullet).min(2).max(3),
  why: copyText, opportunities: z.array(z.looseObject({ signal: copyText, opportunity: copyText, workstream: copyText })).length(3),
  methodology: copyText,
  // validateGeneratedSlots owns next_step and enforces it only when no fixed sentence is set.
  next_step: z.unknown().optional(),
})
/** POST /api/aeo-outbound/generate. start and end are checked by checkRange (range.ts), which owns their messages. */
export const GENERATE_BODY = z.looseObject({ projectId: z.string().min(1), rerunOf: z.string().regex(REPORT_ID_RE).nullish() })
/** A save's writer (the editor queue's UUID) and seq (the item's send order), spec v1.1 18.4. The slots route's structural
 *  guard checks the same two schemas, so the rules hold even when CONTRACT_DISABLED turns the contract off. */
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
})
const storedBullet = z.looseObject({ lead: z.string(), text: z.string() })
/** Stored slots: the copy keys always, the v1.1 keys when the row has them. */
export const STORED_SLOTS = z.looseObject({
  category: z.string(), market: z.string(), headline: z.string(), summary: z.string(), context: z.string(),
  competitive_bullets: z.array(storedBullet).min(2).max(3), sources_bullets: z.array(storedBullet).min(2).max(3),
  why: z.string(), opportunities: z.array(z.looseObject({ signal: z.string(), opportunity: z.string(), workstream: z.string() })).length(3),
  methodology: z.string(), next_step: z.string(),
  brand: z.string().optional(), window_label: z.string().optional(), kpis: z.array(storedKpi).optional(),
  page: z.partialRecord(z.enum(PAGE_KEYS), z.string()).optional(),
})
