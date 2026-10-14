// POST /api/aeo-outbound/generate (spec §7a): {projectId, rerunOf?, start?, end?} runs the whole pipeline inside the
// request under a 270s deadline and returns {id, status, error?}.
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { GENERATION_DEADLINE_MS } from '@/lib/aeo-outbound/config'
import { checkContract, GENERATE_BODY, REPORT_ID_RE } from '@/lib/aeo-outbound/contracts'
import { generateSnapshot } from '@/lib/aeo-outbound/generate'
import { gleanOnce } from '@/lib/aeo-outbound/glean'
import { originAllowed } from '@/lib/aeo-outbound/permissions'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { peecFromEnv, PeecClient, PeecError } from '@/lib/aeo-outbound/peec'
import { listProjects } from '@/lib/aeo-outbound/pull'
import { checkRange, type DayRange } from '@/lib/aeo-outbound/range'
import {
  finishDraftQuery, finishFailedQuery, findGeneratingFor, getReport, insertGeneratingQuery,
  isConstraintViolation, markStaleGeneratingQuery, ONE_GENERATING_INDEX, progressStepQuery,
} from '@/lib/aeo-outbound/store'
import { errorLabel } from '@/lib/aeo-outbound/log'

export const runtime = 'nodejs'
export const maxDuration = 300

const BAD_REQUEST = { error: 'bad-request', code: 'bad-request' }
const UNSTARTED = { error: 'Could not start generation. Try again.' }
const PEEC_NOT_CONFIGURED = { error: "Peec isn't configured on this server. Tell engineering." }
/** A read or write before the pipeline failed: one line with the step and the error's code (never its message), and a 500. */
const unstarted = (step: string, projectId: string, e: unknown) => {
  console.error(`[aeo-outbound] generate ${step} failed project=${projectId} reason=${errorLabel(e)}`)
  return NextResponse.json(UNSTARTED, { status: 500 })
}
const none = (v: unknown) => v === undefined || v === null

export async function POST(req: NextRequest) {
  const started = Date.now()
  const deadline = started + GENERATION_DEADLINE_MS
  const session = await auth()
  const access = await outboundAccess(session?.user)
  if (!access.ok || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const email = access.email

  let body: Record<string, unknown> | null = null
  try {
    const parsed: unknown = await req.json()
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch { /* bad request below */ }
  // v1.1 §10: the body is a contract; a violation keeps the v1.0 400 body.
  if (!checkContract('request.generate', GENERATE_BODY, body).ok) return NextResponse.json(BAD_REQUEST, { status: 400 })
  // The structural guard runs even when CONTRACT_DISABLED turns the contract off, so a bad body is a 400, never a TypeError.
  const projectId = body?.projectId
  const rerunOf = body?.rerunOf ?? null
  if (typeof projectId !== 'string' || !projectId || (rerunOf !== null && !(typeof rerunOf === 'string' && REPORT_ID_RE.test(rerunOf)))) {
    return NextResponse.json(BAD_REQUEST, { status: 400 })
  }

  let range: DayRange | null
  if (rerunOf !== null) {
    if (!none(body?.start) || !none(body?.end)) return NextResponse.json(BAD_REQUEST, { status: 400 })
    let prior
    try { prior = await getReport(rerunOf as string) } catch (e) { return unstarted('rerun read', projectId, e) }
    if (!prior || prior.peecProjectId !== projectId) {
      return NextResponse.json({ error: "That snapshot can't be rerun. Refresh the list.", code: 'bad-rerun' }, { status: 404 })
    }
    // The stored range as stored: an old one may now be past the lookback, and Peec decides.
    range = prior.requestedStart && prior.requestedEnd ? { start: prior.requestedStart, end: prior.requestedEnd } : null
  } else {
    const checked = checkRange({ start: body?.start, end: body?.end }, Date.now())
    if (!checked.ok) return NextResponse.json({ error: checked.error, code: 'bad-range' }, { status: 400 })
    range = checked.range
  }

  let peec: PeecClient
  try { peec = peecFromEnv({ deadline }) } catch (e) {
    // A missing PEEC_AI_CUSTOMER_TOKEN throws in the constructor (peec.ts:60): answer JSON, never crash (v1.1 §9).
    console.error(`[aeo-outbound] generate peec client failed reason=${errorLabel(e)}`)
    return NextResponse.json(PEEC_NOT_CONFIGURED, { status: 502 })
  }
  let project
  try {
    project = (await listProjects(peec)).find((p) => p.id === projectId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof PeecError ? 'Peec is unavailable. Try again.' : 'Could not reach Peec.' }, { status: 502 })
  }
  if (!project) return NextResponse.json({ error: "This Peec project can't be used.", code: 'bad-project' }, { status: 400 })

  try { await markStaleGeneratingQuery(projectId, new Date()) } catch (e) { return unstarted('stale mark', projectId, e) }
  let id: string
  try {
    id = (await insertGeneratingQuery({ projectId, projectName: project.name, createdBy: email, rerunOf: rerunOf as string | null, range }))[0].id
  } catch (e) {
    if (!isConstraintViolation(e, ONE_GENERATING_INDEX)) return unstarted('insert', projectId, e)
    let existing: string | undefined
    try { existing = await findGeneratingFor(projectId) } catch (e2) { return unstarted('find generating', projectId, e2) }
    return NextResponse.json({ error: 'already-generating', id: existing ?? null }, { status: 409 })
  }

  try {
    const result = await generateSnapshot(
      projectId,
      {
        peec,
        // The email is the session's, never a body field. The log carries the report id and the error message only.
        glean: (prompt, signal) => gleanOnce(prompt, signal, email).catch((e) => {
          console.warn(`[aeo-outbound] glean failed id=${id} reason=${e instanceof Error ? e.message : 'error'}`)
          throw e
        }),
        deadline,
        now: Date.now,
        // v1.1 §7: one unawaited, guarded UPDATE per step. It never throws and never slows the run.
        onStep: (step: number) => {
          void Promise.resolve()
            .then(() => progressStepQuery(id, step))
            .then(() => undefined, (e: unknown) => console.warn(`[aeo-outbound] progress not recorded id=${id} step=${step} reason=${errorLabel(e)}`))
        },
      },
      range,
      access.settings,
    )
    if (result.ok) {
      await finishDraftQuery(id, { brandName: result.brandName, data: result.data, slots: result.slots, notes: result.notes, now: new Date() })
      console.info(`[aeo-outbound] generate id=${id} outcome=draft ms=${Date.now() - started}`)
      return NextResponse.json({ id, status: 'draft' })
    }
    await finishFailedQuery(id, result.error, result.brandName, new Date(), result.code)
    console.info(`[aeo-outbound] generate id=${id} outcome=failed code=${result.code} ms=${Date.now() - started}`)
    return NextResponse.json({ id, status: 'failed', error: result.error, code: result.code })
  } catch (e) {
    // Never leave the row generating: a failed write or an unexpected throw still fails it.
    console.error(`[aeo-outbound] generate id=${id} outcome=error step=finish ms=${Date.now() - started} reason=${errorLabel(e)}`)
    try { await finishFailedQuery(id, 'Generation failed. Rerun.', null, new Date(), 'internal') } catch { /* logged above; the stale rule still frees the row */ }
    return NextResponse.json({ id, status: 'failed', error: 'Generation failed. Rerun.', code: 'internal' })
  }
}
