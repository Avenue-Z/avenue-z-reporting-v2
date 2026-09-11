import { describe, expect, test, vi, afterEach } from 'vitest'
import { probe, PROBE_TIMEOUT_MS, SWEEP_BUDGET_MS, type Unit } from './sweep-probe'
import { mapWithConcurrency } from '@/lib/concurrency'

const unit = (section: string): Unit => ({
  url: `https://example.test/portal/acme/reports/${section}?health=1`,
  surface: 'portal',
  clientSlug: 'acme',
  section,
})

/** A page that renders and reports every source healthy. */
const healthyHtml = JSON.stringify({
  surface: 'portal', clientSlug: 'acme', section: 'exec-overview', sources: [{ vendor: 'salesforce', fn: 'openStages', ok: true }],
})
const okPage = () => ({
  status: 200,
  text: async () => `<script id="report-health" type="application/json">${healthyHtml}</script>`,
}) as unknown as Response

/** A render that never answers, but honours the caller's abort signal. */
const hangingPage = () => ((_u: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e)
    })
  })) as unknown as typeof fetch

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

describe('the sweep deadline', () => {
  test('leaves the budget it is given: the two caps are ordered correctly', () => {
    // The per-probe cap only helps if several probes fit inside the phase cap,
    // and the phase cap only helps if it leaves the route room to diff, post and
    // upsert inside its 60s maxDuration.
    expect(PROBE_TIMEOUT_MS).toBeLessThan(SWEEP_BUDGET_MS)
    expect(SWEEP_BUDGET_MS).toBeLessThan(60_000)
  })

  test('skips a unit it never asked, rather than calling it down', async () => {
    // The distinction the whole fix turns on. Marking an unasked unit down posts
    // a 🔴 transition to Slack for a section that may be perfectly healthy —
    // paging someone because WE ran out of budget. Skipping leaves its stored
    // status alone (diffHealth only walks the units it is handed).
    const spy = vi.fn()
    globalThis.fetch = spy as unknown as typeof fetch
    const past = Date.now() - 1
    await expect(probe(unit('exec-overview'), 'c=1', past)).resolves.toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  test('still calls a unit down when it WAS asked and could not answer', async () => {
    // The other side of that line: a probe that got its chance and hung is a
    // real verdict, and must not be quietly swallowed as a skip.
    globalThis.fetch = hangingPage()
    const res = await probe(unit('exec-overview'), 'c=1', Date.now() + 80)
    expect(res?.status).toBe('down')
    expect(res?.detail).toContain('fetch failed')
  })

  test('cuts a late probe to what is left, not to the full per-probe cap', async () => {
    // Without this the phase can overrun by nearly PROBE_TIMEOUT_MS on its last
    // wave. A probe started 80ms before the deadline gets 80ms, not 25s — which
    // is also why this test finishes rather than timing out.
    globalThis.fetch = hangingPage()
    const start = Date.now()
    await probe(unit('exec-overview'), 'c=1', Date.now() + 80)
    expect(Date.now() - start).toBeLessThan(PROBE_TIMEOUT_MS)
  })

  test('reports a healthy page normally when there is budget', async () => {
    globalThis.fetch = (async () => okPage()) as unknown as typeof fetch
    const res = await probe(unit('exec-overview'), 'c=1', Date.now() + SWEEP_BUDGET_MS)
    expect(res).toMatchObject({ key: 'portal:acme:exec-overview', status: 'ok' })
  })

  test('keeps the results of the units it did reach when the phase runs out', async () => {
    // The failure this replaces was all-or-nothing: mapWithConcurrency resolves
    // once or not at all, so a function killed at maxDuration discarded EVERY
    // unit's result, including the ones that answered fine. A sweep meant to
    // report one section down reported nothing at all.
    let calls = 0
    globalThis.fetch = ((_u: string, init?: RequestInit) => {
      // The first two answer immediately; everything after hangs, so the phase
      // deadline is what ends the run.
      if (++calls <= 2) return Promise.resolve(okPage())
      return new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError'; rej(e)
        })
      })
    }) as unknown as typeof fetch

    const units = Array.from({ length: 8 }, (_, i) => unit(`section-${i}`))
    const deadline = Date.now() + 150
    const probed = await mapWithConcurrency(units, 1, (u) => probe(u, 'c=1', deadline))

    const observed = probed.filter((p) => p !== null)
    // Partial, not empty: the two that answered survive the run.
    expect(observed.length).toBeGreaterThanOrEqual(2)
    expect(observed.length).toBeLessThan(units.length)
    expect(observed.filter((o) => o!.status === 'ok')).toHaveLength(2)
    // And the phase honoured its deadline rather than running units.length × the
    // per-probe cap.
    expect(probed.filter((p) => p === null).length).toBeGreaterThan(0)
  })
})
