// lib/organic-social/aeo-informed/contract-validate.ts
// Checks rows against the field specs in contract.ts. Violations name the row and the field and never the value (rows hold client data).
import type { FieldSpec } from './contract'
import { assertIsoDate } from './windows'

export type RuleName = 'missing' | 'null' | 'type' | 'min' | 'max' | 'minLength' | 'oneOf' | 'prefix' | 'extra'
export type FieldViolation = { rule: RuleName; field: string; message: string }
export type RowViolation = FieldViolation & { where: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function kindOk(kind: FieldSpec['kind'], v: unknown): boolean {
  switch (kind) {
    case 'string': return typeof v === 'string'
    case 'int': return isNum(v) && Number.isInteger(v)
    case 'float':
    case 'number': return isNum(v)
    case 'bool': return typeof v === 'boolean'
    case 'date': {
      if (typeof v !== 'string') return false
      try { assertIsoDate(v); return true } catch { return false }
    }
    case 'idList': return Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string')
    case 'idObject': return isObj(v) && typeof v.id === 'string'
    case 'stringList': return Array.isArray(v) && v.every((x) => typeof x === 'string')
  }
}

export function validateRow(row: unknown, fields: readonly FieldSpec[], opts: { closed?: boolean } = {}): FieldViolation[] {
  const out: FieldViolation[] = []
  if (!isObj(row)) return [{ rule: 'type', field: '(row)', message: 'the row is not an object' }]
  for (const s of fields) {
    if (!(s.name in row) || row[s.name] === undefined) {
      if (!s.optional) out.push({ rule: 'missing', field: s.name, message: `${s.name} is missing` })
      continue
    }
    const v = row[s.name]
    if (v === null) {
      if (!s.nullable) out.push({ rule: 'null', field: s.name, message: `${s.name} is null but must not be` })
      continue
    }
    if (!kindOk(s.kind, v)) { out.push({ rule: 'type', field: s.name, message: `${s.name} is not a valid ${s.kind}` }); continue }
    if (typeof v === 'number') {
      if (s.min !== undefined && v < s.min) out.push({ rule: 'min', field: s.name, message: `${s.name} is below its minimum ${s.min}` })
      if (s.max !== undefined && v > s.max) out.push({ rule: 'max', field: s.name, message: `${s.name} is above its maximum ${s.max}` })
    }
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength) out.push({ rule: 'minLength', field: s.name, message: `${s.name} is shorter than ${s.minLength}` })
      if (s.prefix !== undefined && !v.startsWith(s.prefix)) out.push({ rule: 'prefix', field: s.name, message: `${s.name} does not start with ${s.prefix}` })
    }
    if (s.oneOf !== undefined && !(s.oneOf as readonly unknown[]).includes(v)) out.push({ rule: 'oneOf', field: s.name, message: `${s.name} is not one of the allowed values` })
  }
  if (opts.closed) {
    const known = new Set(fields.map((s) => s.name))
    for (const k of Object.keys(row)) if (!known.has(k)) out.push({ rule: 'extra', field: k, message: `${k} is not in the contract` })
  }
  return out
}

export function validateRows(rows: readonly unknown[], fields: readonly FieldSpec[], label: string, opts: { closed?: boolean } = {}): RowViolation[] {
  const out: RowViolation[] = []
  rows.forEach((r, i) => { for (const v of validateRow(r, fields, opts)) out.push({ ...v, where: `${label}[${i}].${v.field}` }) })
  return out
}
