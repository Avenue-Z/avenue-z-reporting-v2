// Spec §7 steps 1-8 over one window. Every report call sends project_id, start_date and end_date and no
// model filter (all models; T3 confirmed). Guards fail with a reason Ryan can act on and a code the UI maps to
// words (v1.1 §7). Every Peec response is checked against its contract before it is used (v1.1 §10).
import { DECISIONS, MAX_WINDOW_DAYS, PITCH_STATUSES } from './config'
import { peecContract } from './contracts'
import { isPeecContractViolation, isPeecDeadline, isPeecRowCap, PeecClient, PeecError, rowsOf } from './peec'
import { defaultRange, todayUtc, type DayRange } from './range'

export interface PeecProject { id: string; name: string; status: string }
export interface RosterBrand { id: string; name: string; is_own: boolean; domains?: string[] | null }
export interface BrandReportRow {
  brand: { id: string; name: string }
  visibility: number
  share_of_voice?: number | null
  position?: number | null
}
/** A domains-report row as the contract enforces it (contracts.ts, peec.domains_report): a non-empty classification and a
 *  mentioned_brands array on every row (spec v1.1 §19.6; Paul, #388 review). */
export interface DomainRow {
  domain: string
  classification: string
  retrieved_chat_count?: number | null
  retrieval_count?: number | null
  retrieved_percentage?: number | null
  /** Enforced by the contract (2026-10-19): the per-domain weight Peec's Domain types chart sums. */
  usage_rate: number
  mentioned_brands: { id: string }[]
}
export interface PeecPull {
  project: PeecProject
  roster: RosterBrand[]
  ownBrand: RosterBrand
  profile: { industry: string | null; markets: string[] } | null
  /** The range asked for (Ryan's dates, or the default). */
  requested: DayRange
  /** True when Ryan picked the range, false when the default applied. */
  rangePicked: boolean
  /** The days inside it that carry data. */
  window: { start: string; end: string }
  /** 2026-10-19: the UTC day of the pull's own instant (nowMs). A window ending on it holds data Peec can still update. */
  pulledDay: string
  brands: BrandReportRow[]
  domains: DomainRow[]
  promptCount: number | null
  models: string[]
  /** Non-fatal problems for the notes panel. */
  warnings: string[]
}

/** An optional call's failure becomes a warning, except a spent deadline or a broken contract. A per-call timeout
 *  with budget left is a warning too (spec 18.3). */
const mustRethrow = (e: unknown): boolean => isPeecDeadline(e) || isPeecContractViolation(e)

export const isUsableProject = (p: PeecProject): boolean => !DECISIONS.pitchOnly || PITCH_STATUSES.includes(p.status)

export async function listProjects(client: PeecClient): Promise<PeecProject[]> {
  const rows = peecContract('peec.projects', await client.all<{ id: string; name?: string; status?: string }>('GET', '/projects', {}, (r) => String(r.id), 1000))
  return rows
    .map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), status: String(r.status ?? '') }))
    .filter(isUsableProject)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function pullSnapshot(client: PeecClient, projectId: string, nowMs: number, onStep?: (step: number) => void, range?: DayRange | null): Promise<PeecPull> {
  onStep?.(1)
  const project = (await listProjects(client)).find((p) => p.id === projectId)
  if (!project) throw new PeecError(`Peec project ${projectId} is not available to this tool`, false, false, 'no_project')

  onStep?.(2)
  const roster = peecContract('peec.brands', await client.all<RosterBrand>('GET', '/brands', { project_id: projectId }, (r) => r.id, 1000))
  const owned = roster.filter((b) => b.is_own)
  if (owned.length !== 1) throw new PeecError(`Peec project needs exactly one own brand (found ${owned.length})`, false, false, 'own_brand_count')

  onStep?.(3)
  const prof = peecContract('peec.project_profile', (await client.call('GET', '/project-profile', { params: { project_id: projectId } })) as
    { profile?: { industry?: string | null; target_markets?: { location?: string | null }[] | null } | null } | null)
  const p = prof?.profile ?? null
  const profile = p
    ? { industry: p.industry?.trim() || null, markets: (p.target_markets ?? []).map((m) => m.location?.trim() ?? '').filter(Boolean) }
    : null

  onStep?.(4)
  // Not validated here: generate validates a fresh request, and a rerun's stored range is used as stored (spec §7a).
  const requested = range ?? defaultRange(nowMs)
  const { start, end } = requested
  let dated: { domain: string; date?: string; retrieved_chat_count?: number | null }[]
  try {
    dated = peecContract('peec.domains_by_date', await client.all<{ domain: string; date?: string; retrieved_chat_count?: number | null }>(
      'POST', '/reports/domains', { project_id: projectId, start_date: start, end_date: end, dimensions: ['date'] },
      (r) => `${r.domain}|${r.date}`, 10_000))
  } catch (e) {
    // Only the full-history default turns the cap into advice; a picked range keeps the client's message.
    if (range == null && isPeecRowCap(e)) throw new PeecError(`This project has too much history for one snapshot. Pick a start and end date, at most ${MAX_WINDOW_DAYS} days.`, false, false, 'history_too_long')
    throw e
  }
  const days = dated.filter((r) => (r.retrieved_chat_count ?? 0) > 0).map((r) => String(r.date ?? '').slice(0, 10)).filter(Boolean).sort()
  if (!days.length) throw new PeecError(`No day between ${start} and ${end} has any Peec data for this project`, false, false, 'no_data')
  const window = { start: days[0], end: days[days.length - 1] }
  const W = { project_id: projectId, start_date: window.start, end_date: window.end }

  onStep?.(5)
  const brands = peecContract('peec.brands_report', await client.all<BrandReportRow>('POST', '/reports/brands', W, (r) => r.brand?.id, 10_000))
  if (!brands.some((r) => r.brand.id === owned[0].id)) throw new PeecError('The own brand has no row in the Peec brands report for this window', false, false, 'own_brand_no_row')
  const warnings: string[] = []
  // Both calls below only supply model names, so any failure but a spent deadline or a broken contract is a
  // warning, a per-call timeout included (spec 18.3).
  let byModel: { brand: { id: string }; model_channel?: { id?: string } | null; visibility_total?: number | null }[] = []
  try {
    byModel = peecContract('peec.brands_by_model', await client.all<{ brand: { id: string }; model_channel?: { id?: string } | null; visibility_total?: number | null }>(
      'POST', '/reports/brands', { ...W, dimensions: ['model_channel_id'] }, (r) => `${r.brand.id}|${r.model_channel?.id}`, 10_000))
  } catch (e) {
    if (mustRethrow(e)) throw e
    warnings.push("Peec's model breakdown could not be loaded, so the models covered are not listed.")
  }
  const channelIds = [...new Set(byModel.filter((r) => (r.visibility_total ?? 0) > 0).map((r) => r.model_channel?.id).filter((x): x is string => !!x))].sort()
  // One unpaged, non-fatal call, as AIVx does (aivx agent/agent.py:1125-1138); names fall back to the ids.
  let channels: { id: string; description?: string | null; current_model?: { id?: string } | null }[] = []
  try {
    channels = peecContract('peec.model_channels', rowsOf<{ id: string; description?: string | null; current_model?: { id?: string } | null }>(await client.call('GET', '/model-channels', { params: { project_id: projectId, limit: 100 } })))
  } catch (e) {
    if (mustRethrow(e)) throw e
    warnings.push("Peec's model names could not be loaded, so models are shown by id.")
  }
  const models = channelIds.map((id) => { const c = channels.find((x) => x.id === id); return c?.description || c?.current_model?.id || id })

  onStep?.(6)
  const domains = peecContract('peec.domains_report', await client.all<DomainRow>('POST', '/reports/domains', W, (r) => r.domain, 10_000))
  if (domains.reduce((s, r) => s + (r.retrieved_chat_count ?? 0), 0) <= 0) throw new PeecError('Peec returned zero retrievals across every domain for this window', false, false, 'zero_retrievals')

  // Round 3 (Paul, #415 review): Peec's recommended actions are no longer read, since pillar reports do not use them.
  // Optional: the methodology leaves the count out when this fails.
  let prompts: { total_count?: number } | null = null
  try {
    prompts = peecContract('peec.prompts', (await client.call('GET', '/prompts', { params: { project_id: projectId, limit: 1 } })) as { total_count?: number } | null)
  } catch (e) {
    if (mustRethrow(e)) throw e
    warnings.push("Peec's prompt count could not be loaded, so the methodology leaves it out.")
  }

  return {
    project, roster, ownBrand: owned[0], profile, requested, rangePicked: range != null, window, pulledDay: todayUtc(nowMs), brands, domains,
    promptCount: typeof prompts?.total_count === 'number' ? prompts.total_count : null,
    models,
    warnings,
  }
}
