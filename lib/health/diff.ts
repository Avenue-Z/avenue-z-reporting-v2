import type { ProbeResult, StoredHealth, Transition } from './types'

/**
 * Compare the stored last-known statuses with this sweep's observations.
 * Returns the transitions worth announcing (status actually changed for a
 * key we've seen before) and the full upsert set (every observed unit, so the
 * first sighting of a unit seeds the table silently — no transition).
 */
export function diffHealth(
  stored: StoredHealth[],
  observed: ProbeResult[],
): { transitions: Transition[]; upserts: ProbeResult[] } {
  const prev = new Map(stored.map((s) => [s.key, s]))
  const transitions: Transition[] = []
  for (const o of observed) {
    const before = prev.get(o.key)
    if (!before) continue
    if (before.status !== o.status) {
      transitions.push({
        key: o.key, surface: o.surface, clientSlug: o.clientSlug, section: o.section,
        from: before.status, to: o.status, detail: o.detail,
      })
    }
  }
  return { transitions, upserts: observed }
}

export function formatTransitions(transitions: Transition[]): string | null {
  if (transitions.length === 0) return null
  const lines = transitions.map((t) => {
    const icon = t.to === 'down' ? '🔴' : '✅'
    const loc = `${t.clientSlug} · ${t.surface} · ${t.section}`
    const tail = t.to === 'down' ? ` — ${t.detail ?? 'failed'}` : ' — recovered'
    return `${icon} ${loc}${tail}`
  })
  return ['*Health changes*', ...lines].join('\n')
}
