// Spec §6 and §7a: pull, compute, write copy with at most two Glean attempts inside the deadline, enforce the
// search guard and the shape check, keep grounding problems as notes.
import { DECISIONS, NEEDS_VALIDATION } from './config'
import { buildSnapshotData, type SnapshotData } from './metrics'
import { isPeecTimeout, PeecClient, PeecError } from './peec'
import { pullSnapshot } from './pull'
import { buildPrompt, dataBlock, parseModelJson } from './prompt'
import { groundingFlags } from './grounding'
import { validateGeneratedSlots, type Slots } from './slots'
import type { GleanReply } from './glean'
import type { DayRange } from './range'

export type GenerationResult =
  | { ok: true; brandName: string; data: SnapshotData; slots: Slots; notes: string[] }
  | { ok: false; error: string; brandName: string | null }

export async function generateSnapshot(
  projectId: string,
  deps: { peec: PeecClient; glean: (prompt: string, signal: AbortSignal) => Promise<GleanReply>; deadline: number; now: () => number },
  range: DayRange | null = null,
): Promise<GenerationResult> {
  let brandName: string | null = null
  let step = 0
  try {
    const pull = await pullSnapshot(deps.peec, projectId, deps.now(), (s) => { step = s }, range)
    brandName = pull.ownBrand.name
    const data = buildSnapshotData(pull, new Date(deps.now()).toISOString())
    const fixed = {
      category: data.category ?? NEEDS_VALIDATION,
      market: data.market ?? NEEDS_VALIDATION,
      ...(DECISIONS.fixedNextStep !== null ? { next_step: DECISIONS.fixedNextStep } : {}),
    }
    const block = dataBlock(data)
    let problems: string[] = []
    let searched = 0
    /** A shape-valid reply whose only problem was grounding: kept so a worse second attempt can't lose it. */
    let groundedFallback: { slots: Slots; flags: string[] } | null = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = deps.deadline - deps.now()
      if (attempt === 2 && left < 60_000) break
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(left, 1))
      let replyText: string
      try {
        const r = await deps.glean(buildPrompt(data, problems), controller.signal)
        if (r.searched) { searched++; problems = ['the answer used sources outside the Data section']; continue }
        replyText = r.text
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') { if (groundedFallback) break; throw e }
        problems = [`the previous answer could not be read (${String((e as Error)?.message ?? e).slice(0, 80)})`]
        continue
      } finally {
        clearTimeout(timer)
      }
      const parsed = parseModelJson(replyText) as Record<string, unknown> | null
      const fixedNow = { ...fixed }
      if (parsed && DECISIONS.writeSpecificCategory && typeof parsed.category === 'string') fixedNow.category = parsed.category
      const checked = validateGeneratedSlots(parsed, fixedNow)
      if (!checked.ok) { problems = checked.errors; continue }
      const flags = groundingFlags(checked.slots, data, block)
      if (!flags.length) return { ok: true, brandName, data, slots: checked.slots, notes: data.notes }
      groundedFallback = { slots: checked.slots, flags }
      if (attempt === 1 && deps.deadline - deps.now() >= 60_000) { problems = flags; continue }
      break
    }
    if (groundedFallback) return { ok: true, brandName, data, slots: groundedFallback.slots, notes: [...data.notes, ...groundedFallback.flags] }
    if (searched === 2) return { ok: false, error: 'Copy generation used outside sources. Rerun.', brandName }
    return { ok: false, error: 'Copy generation failed. Rerun.', brandName }
  } catch (e) {
    // Only this client's own exhausted budget counts (PeecError.timeout), never an upstream body that says "timed out".
    if ((e as Error)?.name === 'AbortError' || isPeecTimeout(e)) return { ok: false, error: `Timed out at step ${step}`, brandName }
    if (e instanceof PeecError) return { ok: false, error: e.message, brandName }
    return { ok: false, error: `Generation failed at step ${step}: ${(e as Error)?.message ?? String(e)}`.slice(0, 300), brandName }
  }
}
