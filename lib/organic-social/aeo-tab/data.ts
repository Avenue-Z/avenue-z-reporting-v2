// lib/organic-social/aeo-tab/data.ts
// The one read the AEO Informed Social section makes. For a client on locked months, a window that ends on or before its last locked day
// is answered from the lock store, captured once from Peec and served from then on, exactly as the Dash numbers are
// (lib/organic-social/locking-client.ts); every other window is the live, cached read (load.ts). Spec
// docs/superpowers/specs/2026-11-12-aeo-informed-social-tab-design.md, section 4 "Locking". Server only.
import { getAeoInformedSocial, type FourthGraph } from '@/lib/organic-social/aeo-informed'
import { CONTRACT_VERSION } from '@/lib/organic-social/aeo-informed/contract'
import { readLock, writeLock } from '@/lib/organic-social/response-lock-store'
import { isLateLock, lockedFrom, requestKey, settledThrough } from '@/lib/organic-social/lock-day'
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import { adapterInput, failureOf, loadAeoTab, toTabResult, warnIfLarge, withDeadline, type AeoTabResult, type PullArgs } from './load'
import type { AeoRange } from './params'
import type { AeoInformedSetting } from './setting'

export type AeoTabData = { kind: 'ok'; result: AeoTabResult; locked: boolean } | { kind: 'no-chats' } | { kind: 'error'; reason: 'timeout' | 'error' }

/**
 * The lock key: a hash of every input that changes the answer, and the contract version, so a result of a different shape is never served
 * from an old row. Changing any of these orphans every lock stored under the old key, and those months recapture live: aeo-lock-key-pin.test.ts
 * pins it so that is always a decision (the rule for the Dash keys, CLAUDE.md "Changing any getter's request shape").
 */
export function aeoLockKey(a: { projectId: string; selector: string; window: { start: string; end: string }; asOf: string; min: number; fourthGraph: FourthGraph }): string {
  return requestKey('aeoInformedSocial', {
    projectId: a.projectId, selector: a.selector, window: { start: a.window.start, end: a.window.end }, asOf: a.asOf, min: a.min, fourthGraph: a.fourthGraph, contract: CONTRACT_VERSION,
  })
}

/**
 * One view of the tab. `today` is the New York date (requestClock().today), the clock Dash's lock uses (base.ts).
 * - Live (no lock): the client has no reportingMonths, its config locks nothing, the window ends after the last locked day
 *   (settledThrough), or before the first locked month (lockedFrom). The same rule as locking-client.ts:79, on the window end.
 * - Locked: a stored answer is served as is (locked: true). A miss captures straight from Peec (Peec reads are no-store, so the answer is
 *   what Peec says now, never a cached one), stores the tab result (no socialsAll) with period_end = the window end, and serves the stored
 *   row (writeLock returns the first one when two captures race). A capture with no socialsAll rows is shown but not stored. A capture that
 *   outlives the viewer's deadline still stores its answer when it lands.
 * - Fail closed: a lock store failure is an error, never live numbers. Change values are kept as captured: they compare with the same-length
 *   window before (Peec's default), not the previous calendar month, so Dash's locked-baseline swap does not apply.
 */
export async function getAeoTabData(a: {
  client: { id: string; slug: string; dashSocialConfig: unknown }; projectId: string; setting: AeoInformedSetting
  window: { start: string; end: string }; asOf: string; min: number; range: AeoRange; deadlineMs: number; today: string
}): Promise<AeoTabData> {
  const rm = hasReportingMonths(a.client) ? (a.client.dashSocialConfig as { reportingMonths?: unknown }).reportingMonths : undefined
  const settled = rm === undefined ? null : settledThrough(rm, a.today)
  const from = rm === undefined ? null : lockedFrom(rm)
  if (!settled || a.window.end > settled || (from !== null && a.window.end < from)) {
    const r = await loadAeoTab({ slug: a.client.slug, projectId: a.projectId, setting: a.setting, window: a.window, asOf: a.asOf, min: a.min, range: a.range, deadlineMs: a.deadlineMs, today: a.today })
    return r.kind === 'ok' ? { ...r, locked: false } : r
  }

  const args: PullArgs = { slug: a.client.slug, range: a.range, projectId: a.projectId, selector: a.setting.selector, window: a.window, asOf: a.asOf, min: a.min, fourthGraph: a.setting.fourthGraph }
  const key = aeoLockKey(args)
  const tag = `slug=${a.client.slug} period_end=${a.window.end} key=${key.slice(0, 12)}`
  // One line per failure: what failed, the client, the month and the key's start, and an error name; never a message or the project id.
  const failed = (what: string, reason: 'timeout' | 'error' = 'error', name?: string): AeoTabData => {
    console.error(`[aeo-informed] ${what} ${tag}${name ? ` error=${name}` : ''}`)
    return { kind: 'error', reason }
  }

  let hit: { response: unknown } | null
  try { hit = await readLock(a.client.id, key) } catch { return failed('lock store read failed') }
  if (hit) return { kind: 'ok', result: hit.response as AeoTabResult, locked: true }

  if (!process.env.PEEC_AI_CUSTOMER_TOKEN) return failed('lock capture failed', 'error', 'PeecKeyMissing')
  // The capture and its write run together, so a capture the viewer stopped waiting for still stores its answer when it lands.
  const captureAndStore = (async (): Promise<AeoTabData> => {
    const full = await getAeoInformedSocial(adapterInput(args))
    const result = toTabResult(full)
    warnIfLarge(result, args)
    if (full.socialsAll.length === 0) {
      console.warn(`[aeo-informed] lock skipped (incomplete answer) ${tag}`)
      return { kind: 'ok', result, locked: false }
    }
    let stored: unknown
    try { stored = await writeLock(a.client.id, key, a.window.end, result) } catch { return failed('lock store write failed') }
    if (isLateLock(a.window.end, rm, a.today)) console.warn(`[aeo-informed] late lock ${tag}`)
    return { kind: 'ok', result: stored as AeoTabResult, locked: true }
  })()
  try {
    return await withDeadline(captureAndStore, a.deadlineMs)
  } catch (e) {
    const f = failureOf(e)
    return f.kind === 'no-chats' ? f : failed('lock capture failed', f.reason, f.name)
  }
}
