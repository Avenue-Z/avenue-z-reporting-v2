// Data contracts (spec v1.1 §10). contract-core's model (one declared schema per boundary, a mode per boundary, one
// log line per violation naming the boundary, field and issue, never a value, and a kill switch) applied with zod,
// because contract-core is Python. Peec boundaries enforce their numeric fields and observe every other field they read.
import { z } from 'zod'
import { CONTRACT_MODES, type ContractBoundary, type ContractMode } from './config'
import { PeecError } from './peec'

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
