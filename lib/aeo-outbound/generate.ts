// Spec §6 and §7a (v1.1 §7, §10): pull, compute, write copy with at most two Glean attempts inside the deadline, enforce
// the search guard, the reply contract and the shape check, keep grounding problems as notes. Every failure carries
// a code the UI turns into plain words.
import { DECISIONS, MAX_WINDOW_DAYS, NEEDS_VALIDATION } from './config'
import { checkContract, GLEAN_SLOTS } from './contracts'
import type { ErrorCode } from './error-codes'
import { buildSnapshotData, type SnapshotData } from './metrics'
import type { Note, StoredNote } from './notes'
import { isPeecTimeout, PeecClient, PeecError } from './peec'
import { pullSnapshot } from './pull'
import { buildPrompt, dataBlock, parseModelJson } from './prompt'
import { groundingFlags } from './grounding'
import { cleanValue, MAX_LEAD, pageDefaults, validateGeneratedSlots, withDefaults, type FullSlots } from './slots'
import type { GleanReply } from './glean'
import type { DayRange } from './range'
import { SETTINGS_DEFAULTS, type GenerationSettings } from './settings'

export type GenerationResult =
  | { ok: true; brandName: string; data: SnapshotData; slots: FullSlots; notes: StoredNote[] }
  | { ok: false; error: string; code: ErrorCode; brandName: string | null }

/** The step reported while Glean writes the copy (v1.1 §7). Pull reports 1 to 6 and 8; there is no step 7. */
export const WRITING_STEP = 9
/** The step reported just before Glean's second attempt, only when it runs (spec v1.1 §16.3). */
export const SECOND_ATTEMPT_STEP = 10

export async function generateSnapshot(
  projectId: string,
  deps: { peec: PeecClient; glean: (prompt: string, signal: AbortSignal) => Promise<GleanReply>; deadline: number; now: () => number; onStep?: (step: number) => void },
  range: DayRange | null = null,
  settings: GenerationSettings = SETTINGS_DEFAULTS,
): Promise<GenerationResult> {
  let brandName: string | null = null
  let step = 0
  const reach = (s: number) => { step = s; deps.onStep?.(s) }
  try {
    const pull = await pullSnapshot(deps.peec, projectId, deps.now(), reach, range)
    brandName = pull.ownBrand.name
    const data = buildSnapshotData(
      pull,
      new Date(deps.now()).toISOString(),
      { rankAmong: settings.rankAmong, competitorSiteGaps: DECISIONS.competitorSiteGaps, sourceMixWeight: DECISIONS.sourceMixWeight },
      { peecOpportunityRows: settings.peecOpportunityRows, methodologyStatesPromptsAndModels: settings.methodologyStatesPromptsAndModels, fixedNextStep: settings.fixedNextStep },
    )
    const fixed = {
      category: data.category ?? NEEDS_VALIDATION,
      market: data.market ?? NEEDS_VALIDATION,
      ...(settings.fixedNextStep !== null ? { next_step: settings.fixedNextStep } : {}),
    }
    const block = dataBlock(data)
    let problems: string[] = []
    let lastSearched = false
    /** A shape-valid reply whose only problem was grounding. A second attempt replaces it only with no more flags (a tie
     *  takes the second), and a second attempt that fails shape, is searched or aborts never does (spec v1.1 §18.7). */
    let groundedFallback: { slots: FullSlots; flags: Note[] } | null = null
    reach(WRITING_STEP)
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = deps.deadline - deps.now()
      if (attempt === 2 && left < 60_000) break
      if (attempt === 2) reach(SECOND_ATTEMPT_STEP)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(left, 1))
      let replyText: string
      try {
        const r = await deps.glean(buildPrompt(data, problems), controller.signal)
        lastSearched = r.searched
        if (r.searched) { problems = ['the answer used sources outside the Data section']; continue }
        replyText = r.text
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') { if (groundedFallback) break; throw e }
        problems = [`the previous answer could not be read (${String((e as Error)?.message ?? e).slice(0, 80)})`]
        continue
      } finally {
        clearTimeout(timer)
      }
      const parsed = parseModelJson(replyText) as Record<string, unknown> | null
      // v1.1 §10: the reply's shape is a contract. A violation is a shape problem fed to the one retry.
      const shape = checkContract('glean.slots', GLEAN_SLOTS, parsed)
      if (!shape.ok) { problems = shape.issues.map((i) => `${i.field}: ${i.issue}`); continue }
      const fixedNow = { ...fixed }
      if (DECISIONS.writeSpecificCategory && typeof parsed?.category === 'string') {
        // Glean's category only when it fits (spec v1.1 §16.1, Task 3b); anything else keeps the code value and never retries or fails.
        const written = cleanValue(parsed.category)
        if (written && written.length <= MAX_LEAD) fixedNow.category = written
      }
      const checked = validateGeneratedSlots(parsed, fixedNow)
      if (!checked.ok) { problems = checked.errors; continue }
      // v1.1 §3: the row is created with every key: brand, window label and KPIs from its data, words from settings.
      const full: FullSlots = { ...withDefaults(checked.slots, data), page: pageDefaults(settings) }
      const flags = groundingFlags(full, data, block)
      if (!flags.length) return { ok: true, brandName, data, slots: full, notes: data.notes }
      if (!groundedFallback || flags.length <= groundedFallback.flags.length) groundedFallback = { slots: full, flags }
      // Only flags on words Glean writes are worth a retry: page words, KPIs, brand, window label and market are code- or settings-set,
      // and so is next_step while a fixed sentence is set (every flag is still stored as a note).
      const codeSet = ['brand', 'window_label', 'market', ...(settings.fixedNextStep !== null ? ['next_step'] : [])]
      const fixable = flags.filter((f) => !/^(page\.|kpis\.)/.test(f.path ?? '') && !codeSet.includes(f.path ?? ''))
      if (fixable.length && attempt === 1 && deps.deadline - deps.now() >= 60_000) { problems = fixable.map((f) => `${f.path ?? ''}: ${f.text}`); continue }
      break
    }
    if (groundedFallback) return { ok: true, brandName, data, slots: groundedFallback.slots, notes: [...data.notes, ...groundedFallback.flags] }
    if (lastSearched) return { ok: false, error: 'Copy generation used outside sources. Rerun.', code: 'copy_outside_sources', brandName }
    return { ok: false, error: 'Copy generation failed. Rerun.', code: 'copy_failed', brandName }
  } catch (e) {
    // Only this client's own exhausted budget counts (PeecError.timeout), never an upstream body that says "timed out".
    if ((e as Error)?.name === 'AbortError' || isPeecTimeout(e)) {
      const history = range == null && step === 4
      return { ok: false, error: history ? `Timed out at step 4. Pick a start and end date, at most ${MAX_WINDOW_DAYS} days.` : `Timed out at step ${step}`, code: history ? 'history_too_long' : 'timeout', brandName }
    }
    if (e instanceof PeecError) return { ok: false, error: e.message, code: e.code ?? 'peec_error', brandName }
    return { ok: false, error: `Generation failed at step ${step}: ${(e as Error)?.message ?? String(e)}`.slice(0, 300), code: 'internal', brandName }
  }
}
