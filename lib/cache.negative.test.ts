import { describe, expect, test, vi } from 'vitest'
// unstable_cache throws ("Invariant: incrementalCache missing") outside a real
// request context, which every test here is. A pass-through keeps the positive
// path honest in the only way it can be from here — the impl runs on every call
// that reaches it — which is exactly what makes the negative memo observable:
// any call that does NOT reach the impl was served by the memo.
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }))

import { cached } from './cache'
import { runWithCollector, getCollected } from './health/collector'

describe('negative caching bounds a persistently failing fetcher', () => {
  // The problem it exists for: unstable_cache stores fulfilled results only, so
  // a rejected call writes no entry and the query is re-issued in full on every
  // render — paying its whole timeout each time, forever. On the Salesforce
  // pipeline that is a 60s ceiling per render, on a page a health sweep probes
  // under a 60s function budget of its own.
  test('replays a failure for the length of the window instead of re-issuing it', async () => {
    let calls = 0
    const failing = cached('t', 'replay', async (_slug: string) => {
      calls++
      throw new Error('vendor down')
    }, { negativeTtlSeconds: 60 })

    await expect(failing('acme')).rejects.toThrow('vendor down')
    await expect(failing('acme')).rejects.toThrow('vendor down')
    await expect(failing('acme')).rejects.toThrow('vendor down')
    // Still rejecting, and rejecting with the real error — the caller's degrade
    // path is unchanged. Only the round trip is skipped.
    expect(calls).toBe(1)
  })

  test('lets the next call through once the window has passed', async () => {
    let calls = 0
    const flaky = cached('t', 'expire', async (_slug: string) => {
      calls++
      if (calls === 1) throw new Error('blip')
      return 'recovered'
    }, { negativeTtlSeconds: 0.05 })

    await expect(flaky('acme')).rejects.toThrow('blip')
    await new Promise((r) => setTimeout(r, 80))
    // The whole point of a SHORT negative TTL: a transient failure clears almost
    // immediately rather than being pinned for the positive TTL's full hour.
    await expect(flaky('acme')).resolves.toBe('recovered')
    expect(calls).toBe(2)
  })

  test('memoises per argument set, so one client cannot suppress another', async () => {
    const seen: string[] = []
    const failing = cached('t', 'perarg', async (slug: string) => {
      seen.push(slug)
      throw new Error(`down for ${slug}`)
    }, { negativeTtlSeconds: 60 })

    await expect(failing('acme')).rejects.toThrow('down for acme')
    await expect(failing('acme')).rejects.toThrow('down for acme')
    // A shared key here would mean one client's outage silently returning
    // another client's error — a wrong number, not just a missing one.
    await expect(failing('globex')).rejects.toThrow('down for globex')
    expect(seen).toEqual(['acme', 'globex'])
  })

  test('remembers nothing when no negative TTL is asked for', async () => {
    let calls = 0
    const failing = cached('t', 'optin', async () => {
      calls++
      throw new Error('down')
    })
    await expect(failing()).rejects.toThrow('down')
    await expect(failing()).rejects.toThrow('down')
    // Opt-in: every other cached() call site in the repo keeps its old behaviour.
    expect(calls).toBe(2)
  })

  test('never memoises a success as a failure', async () => {
    let calls = 0
    const fine = cached('t', 'success', async () => {
      calls++
      return calls
    }, { negativeTtlSeconds: 60 })
    await expect(fine()).resolves.toBe(1)
    await expect(fine()).resolves.toBe(2)
    expect(calls).toBe(2)
  })
})

describe('health severity separates a dashed tile from a missing delta', () => {
  test('a critical fetcher reports its failure to the probe', async () => {
    const failing = cached('t', 'critical', async () => {
      throw new Error('boom')
    })
    const collected = await runWithCollector(async () => {
      await expect(failing()).rejects.toThrow('boom')
      return getCollected()
    })
    expect(collected).toEqual([{ vendor: 't', fn: 'critical', ok: false, error: 'boom' }])
  })

  test('a non-critical fetcher stays out of the failed set', async () => {
    // deriveStatus marks a section down if ANY recorded source failed, so a
    // delta-only fetch landing in this set would page Slack over a missing
    // year-over-year arrow on a page that rendered every figure it owes.
    const failing = cached('t', 'noncritical', async () => {
      throw new Error('boom')
    }, { healthCritical: false })
    const collected = await runWithCollector(async () => {
      await expect(failing()).rejects.toThrow('boom')
      return getCollected()
    })
    expect(collected).toEqual([])
  })

  test('a replayed failure still reports, so a live outage cannot hide behind the memo', async () => {
    // The memo must not become a way for a persistent outage to go unnoticed:
    // suppressing the record here would silence the probe for as long as the
    // failure kept refreshing it.
    const failing = cached('t', 'replayreports', async () => {
      throw new Error('still down')
    }, { negativeTtlSeconds: 60 })
    await expect(failing()).rejects.toThrow('still down')
    const collected = await runWithCollector(async () => {
      await expect(failing()).rejects.toThrow('still down')
      return getCollected()
    })
    expect(collected).toEqual([{ vendor: 't', fn: 'replayreports', ok: false, error: 'still down' }])
  })
})
