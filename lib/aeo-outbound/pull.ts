// Spec §7 steps 1-8 over one window. Every report call sends project_id, start_date and end_date and no
// model filter (all models; T3 confirmed). Guards fail with a reason Ryan can act on.
import { DECISIONS, PITCH_STATUSES } from './config'
import { PeecClient, PeecError, rowsOf } from './peec'
import { defaultRange, type DayRange } from './range'

export interface PeecProject { id: string; name: string; status: string }
export interface RosterBrand { id: string; name: string; is_own: boolean; domains?: string[] | null }
export interface BrandReportRow {
  brand: { id: string; name: string }
  visibility: number
  share_of_voice?: number | null
  position?: number | null
}
export interface DomainRow {
  domain: string
  classification?: string | null
  retrieved_chat_count?: number | null
  retrieval_count?: number | null
  retrieved_percentage?: number | null
  mentioned_brands?: { id: string }[] | null
}
export interface ActionRow { id: string; title?: string | null; impact?: string | null; type?: string | null; status?: string | null }
export interface PeecPull {
  project: PeecProject
  roster: RosterBrand[]
  ownBrand: RosterBrand
  profile: { industry: string | null; markets: string[] } | null
  /** The range asked for (Ryan's dates, or the default). */
  requested: DayRange
  /** The days inside it that carry data. */
  window: { start: string; end: string }
  brands: BrandReportRow[]
  domains: DomainRow[]
  actions: ActionRow[]
  promptCount: number | null
  models: string[]
  /** Non-fatal problems for the notes panel. */
  warnings: string[]
}

// The two PeecError message formats for an exhausted budget (peec.ts): `${path}: deadline reached` and
// `${path}: timed out after ${timeoutMs}ms`. Optional calls rethrow these instead of warning.
const DEADLINE_ERROR = /: (timed out after \d+ms|deadline reached)$/
const isDeadline = (e: unknown): boolean => e instanceof PeecError && DEADLINE_ERROR.test(e.message)

export const isUsableProject = (p: PeecProject): boolean => !DECISIONS.pitchOnly || PITCH_STATUSES.includes(p.status)

export async function listProjects(client: PeecClient): Promise<PeecProject[]> {
  const rows = await client.all<{ id: string; name?: string; status?: string }>('GET', '/projects', {}, (r) => String(r.id), 1000)
  return rows
    .map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), status: String(r.status ?? '') }))
    .filter(isUsableProject)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function pullSnapshot(client: PeecClient, projectId: string, nowMs: number, onStep?: (step: number) => void, range?: DayRange | null): Promise<PeecPull> {
  onStep?.(1)
  const project = (await listProjects(client)).find((p) => p.id === projectId)
  if (!project) throw new PeecError(`Peec project ${projectId} is not available to this tool`)

  onStep?.(2)
  const roster = await client.all<RosterBrand>('GET', '/brands', { project_id: projectId }, (r) => r.id, 1000)
  const owned = roster.filter((b) => b.is_own)
  if (owned.length !== 1) throw new PeecError(`Peec project needs exactly one own brand (found ${owned.length})`)

  onStep?.(3)
  const prof = (await client.call('GET', '/project-profile', { params: { project_id: projectId } })) as
    { profile?: { industry?: string | null; target_markets?: { location?: string | null }[] | null } | null } | null
  const p = prof?.profile ?? null
  const profile = p
    ? { industry: p.industry?.trim() || null, markets: (p.target_markets ?? []).map((m) => m.location?.trim() ?? '').filter(Boolean) }
    : null

  onStep?.(4)
  // Not validated here: generate validates a fresh request, and a rerun's stored range is used as stored (spec §7a).
  const requested = range ?? defaultRange(nowMs)
  const { start, end } = requested
  const dated = await client.all<{ domain: string; date?: string; retrieved_chat_count?: number | null }>(
    'POST', '/reports/domains', { project_id: projectId, start_date: start, end_date: end, dimensions: ['date'] },
    (r) => `${r.domain}|${r.date}`, 10_000)
  const days = dated.filter((r) => (r.retrieved_chat_count ?? 0) > 0).map((r) => String(r.date ?? '').slice(0, 10)).filter(Boolean).sort()
  if (!days.length) throw new PeecError(`No day between ${start} and ${end} has any Peec data for this project`)
  const window = { start: days[0], end: days[days.length - 1] }
  const W = { project_id: projectId, start_date: window.start, end_date: window.end }

  onStep?.(5)
  const brands = await client.all<BrandReportRow>('POST', '/reports/brands', W, (r) => r.brand.id, 10_000)
  if (!brands.some((r) => r.brand.id === owned[0].id)) throw new PeecError('The own brand has no row in the Peec brands report for this window')
  const byModel = await client.all<{ brand: { id: string }; model_channel?: { id?: string } | null; visibility_total?: number | null }>(
    'POST', '/reports/brands', { ...W, dimensions: ['model_channel_id'] }, (r) => `${r.brand.id}|${r.model_channel?.id}`, 10_000)
  const channelIds = [...new Set(byModel.filter((r) => (r.visibility_total ?? 0) > 0).map((r) => r.model_channel?.id).filter((x): x is string => !!x))].sort()
  const warnings: string[] = []
  // One unpaged, non-fatal call, as AIVx does (aivx agent/agent.py:1125-1138); names fall back to the ids.
  const channels = rowsOf<{ id: string; description?: string | null; current_model?: { id?: string } | null }>(
    await client.call('GET', '/model-channels', { params: { project_id: projectId, limit: 100 } }).catch(() => null))
  const models = channelIds.map((id) => { const c = channels.find((x) => x.id === id); return c?.description || c?.current_model?.id || id })

  onStep?.(6)
  const domains = await client.all<DomainRow>('POST', '/reports/domains', W, (r) => r.domain, 10_000)
  if (domains.reduce((s, r) => s + (r.retrieved_chat_count ?? 0), 0) <= 0) throw new PeecError('Peec returned zero retrievals across every domain for this window')

  onStep?.(8)
  // One unpaged call (spec §7 step 8), default order impact desc; non-fatal, since actions are optional.
  let actions: ActionRow[] = []
  try {
    actions = rowsOf<ActionRow>(await client.call('POST', '/actions/list', { body: { project_id: projectId, limit: 50 } })).filter((a) => a.status === 'PENDING').slice(0, 10)
  } catch (e) {
    if (isDeadline(e)) throw e
    warnings.push('Peec actions could not be loaded, so opportunities come from the data only.')
  }
  // Optional: the methodology leaves the count out when this fails.
  let prompts: { total_count?: number } | null = null
  try {
    prompts = (await client.call('GET', '/prompts', { params: { project_id: projectId, limit: 1 } })) as { total_count?: number } | null
  } catch (e) {
    if (isDeadline(e)) throw e
    warnings.push("Peec's prompt count could not be loaded, so the methodology leaves it out.")
  }

  return {
    project, roster, ownBrand: owned[0], profile, requested, window, brands, domains, actions,
    promptCount: typeof prompts?.total_count === 'number' ? prompts.total_count : null,
    models,
    warnings,
  }
}
