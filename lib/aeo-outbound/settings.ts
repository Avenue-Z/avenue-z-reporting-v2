// The tool's settings (spec v1.1 §8): types, the config.ts defaults used when no row exists, the row read through its
// contract, form validation with the §8 limits, and the per-field change list the log records. pitchOnly and
// needsValidationBlocksApprove stay config.ts constants, never settings.
import { DECISIONS } from './config'
import { checkContract, SETTINGS_ROW } from './contracts'
import type { SettingsChange, SettingsValues } from './settings-store'
import { cleanValue } from './slots'

export type OutboundSettings = SettingsValues
/** What a generation reads from the settings. */
export type GenerationSettings = Pick<OutboundSettings, 'sectionTitles' | 'fixedNextStep' | 'rankAmong' | 'peecOpportunityRows' | 'methodologyStatesPromptsAndModels' | 'sidebarWordmark'>

export const SETTINGS_DEFAULTS: OutboundSettings = {
  users: [],
  admins: [],
  sectionTitles: [DECISIONS.sectionTitles[0], DECISIONS.sectionTitles[1]],
  fixedNextStep: DECISIONS.fixedNextStep,
  rankAmong: DECISIONS.rankAmong,
  peecOpportunityRows: DECISIONS.peecOpportunityRows,
  methodologyStatesPromptsAndModels: DECISIONS.methodologyStatesPromptsAndModels,
  sidebarWordmark: DECISIONS.showAivxName ? 'AIVx' : 'Avenue Z',
}
export const SETTINGS_LIMITS = { people: 50, emailChars: 200, title: 60, nextStep: 300, rankMin: 2, rankMax: 50, peecRowsMax: 3 } as const
export const SETTINGS_ERRORS = {
  email: 'Each email must end in @avenuez.com.',
  emailLong: 'Keep each email under 200 characters.',
  tooMany: 'List at most 50 people.',
  title: 'Section titles need 1 to 60 characters.',
  nextStep: 'The next-step sentence needs 1 to 300 characters.',
  rank: 'Rank among must be a whole number from 2 to 50.',
  peecRows: 'Pick 0, 1, 2 or 3.',
  wordmark: 'Pick AIVx or Avenue Z.',
  lastAdmin: 'Keep at least one admin.',
  conflict: 'Someone else changed these settings. Reload to see their changes.',
  readFailed: "The settings couldn't be loaded, so they can't be saved now. Reload and try again.",
} as const
export type SettingsField = keyof OutboundSettings
export const SETTINGS_FIELD_LABELS: Record<SettingsField, string> = {
  users: 'Who can use the tool',
  admins: 'Admins',
  sectionTitles: 'Section titles',
  fixedNextStep: 'Next step',
  rankAmong: 'Rank the brand among',
  peecOpportunityRows: 'Most opportunities from Peec recommendations',
  methodologyStatesPromptsAndModels: 'Methodology names the prompt count and the AI models',
  sidebarWordmark: 'Menu wordmark',
}
const FIELDS: SettingsField[] = ['users', 'admins', 'sectionTitles', 'fixedNextStep', 'rankAmong', 'peecOpportunityRows', 'methodologyStatesPromptsAndModels', 'sidebarWordmark']

/** A stored people list: an array of at most 50 strings, each an @avenuez.com address of at most 200 characters. */
const isAccessList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= SETTINGS_LIMITS.people && v.every((e) => typeof e === 'string' && e.length <= SETTINGS_LIMITS.emailChars && e.endsWith('@avenuez.com'))

/** The row as settings. No row: the defaults. A row that breaks its contract: the defaults, flagged invalid, with its
 *  updated_at kept so an admin's save can replace it. */
export function resolveSettings(row: unknown): { settings: OutboundSettings; updatedAt: string | null; invalid: boolean } {
  if (row === null || row === undefined) return { settings: SETTINGS_DEFAULTS, updatedAt: null, invalid: false }
  const at = (row as { updatedAt?: unknown }).updatedAt
  const updatedAt = at instanceof Date ? at.toISOString() : null
  // This guard holds even under the CONTRACT_DISABLED kill switch, because users and admins decide access.
  if (!isAccessList((row as { users?: unknown }).users) || !isAccessList((row as { admins?: unknown }).admins)) return { settings: SETTINGS_DEFAULTS, updatedAt, invalid: true }
  if (!checkContract('settings.row', SETTINGS_ROW, row).ok) return { settings: SETTINGS_DEFAULTS, updatedAt, invalid: true }
  const r = row as OutboundSettings
  return {
    settings: {
      users: r.users, admins: r.admins, sectionTitles: [r.sectionTitles[0], r.sectionTitles[1]], fixedNextStep: r.fixedNextStep,
      rankAmong: r.rankAmong, peecOpportunityRows: r.peecOpportunityRows,
      methodologyStatesPromptsAndModels: r.methodologyStatesPromptsAndModels, sidebarWordmark: r.sidebarWordmark,
    },
    updatedAt,
    invalid: false,
  }
}

/** Split on commas, semicolons and whitespace; trimmed, lowercased, blanks and repeats dropped. */
export const parseEmails = (raw: string): string[] => [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]

/** What the settings form sends. */
export interface SettingsInput {
  users: string
  admins: string
  section1: string
  section2: string
  nextStepMode: 'written' | 'fixed'
  nextStep: string
  rankMode: 'all' | 'top'
  rankAmong: string
  peecOpportunityRows: string
  methodologyStatesPromptsAndModels: boolean
  sidebarWordmark: string
}
export type SettingsErrors = Partial<Record<SettingsField, string>>

export function validateSettingsInput(input: SettingsInput): { ok: true; values: OutboundSettings } | { ok: false; errors: SettingsErrors } {
  const errors: SettingsErrors = {}
  const people = (raw: unknown, field: 'users' | 'admins'): string[] => {
    const list = parseEmails(typeof raw === 'string' ? raw : '')
    if (list.length > SETTINGS_LIMITS.people) errors[field] = SETTINGS_ERRORS.tooMany
    else if (list.some((e) => e.length > SETTINGS_LIMITS.emailChars)) errors[field] = SETTINGS_ERRORS.emailLong
    else if (list.some((e) => !/^[^@\s]+@avenuez\.com$/.test(e))) errors[field] = SETTINGS_ERRORS.email
    return list
  }
  const users = people(input.users, 'users')
  const admins = people(input.admins, 'admins')
  const titles = [input.section1, input.section2].map((t) => cleanValue(typeof t === 'string' ? t : ''))
  if (titles.some((t) => t.length < 1 || t.length > SETTINGS_LIMITS.title)) errors.sectionTitles = SETTINGS_ERRORS.title
  let fixedNextStep: string | null = null
  if (input.nextStepMode === 'fixed') {
    fixedNextStep = cleanValue(typeof input.nextStep === 'string' ? input.nextStep : '')
    if (fixedNextStep.length < 1 || fixedNextStep.length > SETTINGS_LIMITS.nextStep) errors.fixedNextStep = SETTINGS_ERRORS.nextStep
  }
  let rankAmong: number | null = null
  if (input.rankMode === 'top') {
    const raw = String(input.rankAmong ?? '').trim()
    rankAmong = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
    if (!(rankAmong >= SETTINGS_LIMITS.rankMin && rankAmong <= SETTINGS_LIMITS.rankMax)) errors.rankAmong = SETTINGS_ERRORS.rank
  }
  const rowsRaw = String(input.peecOpportunityRows ?? '')
  if (!/^[0-3]$/.test(rowsRaw)) errors.peecOpportunityRows = SETTINGS_ERRORS.peecRows
  if (input.sidebarWordmark !== 'AIVx' && input.sidebarWordmark !== 'Avenue Z') errors.sidebarWordmark = SETTINGS_ERRORS.wordmark
  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    values: {
      users, admins, sectionTitles: [titles[0], titles[1]], fixedNextStep, rankAmong,
      peecOpportunityRows: Number(rowsRaw), methodologyStatesPromptsAndModels: input.methodologyStatesPromptsAndModels === true,
      sidebarWordmark: input.sidebarWordmark as OutboundSettings['sidebarWordmark'],
    },
  }
}

/** One entry per field whose value changed, in a fixed order, for the log table. before null (a stored row that broke
 *  its contract) logs every field, so an admin's save always replaces such a row. */
export function settingsChanges(before: OutboundSettings | null, after: OutboundSettings): SettingsChange[] {
  return FIELDS.filter((f) => before === null || JSON.stringify(before[f]) !== JSON.stringify(after[f])).map((f) => ({ field: f, oldValue: before ? before[f] : null, newValue: after[f] }))
}

/** The form's starting values for a set of settings. */
export function settingsToInput(s: OutboundSettings): SettingsInput {
  return {
    users: s.users.join('\n'), admins: s.admins.join('\n'), section1: s.sectionTitles[0], section2: s.sectionTitles[1],
    nextStepMode: s.fixedNextStep === null ? 'written' : 'fixed', nextStep: s.fixedNextStep ?? '',
    rankMode: s.rankAmong === null ? 'all' : 'top', rankAmong: s.rankAmong === null ? '' : String(s.rankAmong),
    peecOpportunityRows: String(s.peecOpportunityRows), methodologyStatesPromptsAndModels: s.methodologyStatesPromptsAndModels, sidebarWordmark: s.sidebarWordmark,
  }
}
