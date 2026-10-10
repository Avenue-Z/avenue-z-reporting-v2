// POST /api/aeo-outbound/generate (spec §7a): {projectId, rerunOf?, start?, end?} runs the whole pipeline inside the
// request under a 270s deadline and returns {id, status, error?}.
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { GENERATION_DEADLINE_MS } from '@/lib/aeo-outbound/config'
import { generateSnapshot } from '@/lib/aeo-outbound/generate'
import { gleanOnce } from '@/lib/aeo-outbound/glean'
import { originAllowed, outboundEmail } from '@/lib/aeo-outbound/permissions'
import { peecFromEnv, PeecError } from '@/lib/aeo-outbound/peec'
import { listProjects } from '@/lib/aeo-outbound/pull'
import { checkRange, type DayRange } from '@/lib/aeo-outbound/range'
import {
  finishDraftQuery, finishFailedQuery, findGeneratingFor, getReport, insertGeneratingQuery,
  isConstraintViolation, isReportId, markStaleGeneratingQuery, ONE_GENERATING_INDEX,
} from '@/lib/aeo-outbound/store'
import { errorLabel } from '@/lib/aeo-outbound/log'

export const runtime = 'nodejs'
export const maxDuration = 300

const BAD_REQUEST = { error: 'bad-request', code: 'bad-request' }
const none = (v: unknown) => v === undefined || v === null

export async function POST(req: NextRequest) {
  const started = Date.now()
  const deadline = started + GENERATION_DEADLINE_MS
  const session = await auth()
  const email = outboundEmail(session?.user)
  if (!email || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown> | null = null
  try {
    const parsed: unknown = await req.json()
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch { /* bad request below */ }
  const projectId = body?.projectId
  const rerunOf = body?.rerunOf ?? null
  if (typeof projectId !== 'string' || !projectId || (rerunOf !== null && !isReportId(rerunOf))) {
    return NextResponse.json(BAD_REQUEST, { status: 400 })
  }

  let range: DayRange | null
  if (rerunOf !== null) {
    if (!none(body?.start) || !none(body?.end)) return NextResponse.json(BAD_REQUEST, { status: 400 })
    const prior = await getReport(rerunOf as string)
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

  const peec = peecFromEnv({ deadline })
  let project
  try {
    project = (await listProjects(peec)).find((p) => p.id === projectId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof PeecError ? 'Peec is unavailable. Try again.' : 'Could not reach Peec.' }, { status: 502 })
  }
  if (!project) return NextResponse.json({ error: "This Peec project can't be used.", code: 'bad-project' }, { status: 400 })

  await markStaleGeneratingQuery(projectId, new Date())
  let id: string
  try {
    id = (await insertGeneratingQuery({ projectId, projectName: project.name, createdBy: email, rerunOf: rerunOf as string | null, range }))[0].id
  } catch (e) {
    if (isConstraintViolation(e, ONE_GENERATING_INDEX)) return NextResponse.json({ error: 'already-generating', id: (await findGeneratingFor(projectId)) ?? null }, { status: 409 })
    console.error(`[aeo-outbound] generate insert failed project=${projectId} reason=${errorLabel(e)}`)
    return NextResponse.json({ error: 'Could not start generation. Try again.' }, { status: 500 })
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
      },
      range,
    )
    if (result.ok) {
      await finishDraftQuery(id, { brandName: result.brandName, data: result.data, slots: result.slots, notes: result.notes, now: new Date() })
      console.info(`[aeo-outbound] generate id=${id} outcome=draft ms=${Date.now() - started}`)
      return NextResponse.json({ id, status: 'draft' })
    }
    await finishFailedQuery(id, result.error, result.brandName, new Date())
    console.info(`[aeo-outbound] generate id=${id} outcome=failed ms=${Date.now() - started}`)
    return NextResponse.json({ id, status: 'failed', error: result.error })
  } catch (e) {
    // Never leave the row generating: a failed write or an unexpected throw still fails it.
    console.error(`[aeo-outbound] generate id=${id} outcome=error step=finish ms=${Date.now() - started} reason=${errorLabel(e)}`)
    try { await finishFailedQuery(id, 'Generation failed. Rerun.', null, new Date()) } catch { /* logged above; the stale rule still frees the row */ }
    return NextResponse.json({ id, status: 'failed', error: 'Generation failed. Rerun.' })
  }
}
