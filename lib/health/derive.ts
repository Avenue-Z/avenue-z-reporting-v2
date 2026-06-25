import type { HealthBeacon, ProbeResult, Surface } from './types'

const BEACON_RE = /<script[^>]*id="report-health"[^>]*>([\s\S]*?)<\/script>/

export function parseBeacon(html: string): HealthBeacon | null {
  const m = html.match(BEACON_RE)
  if (!m) return null
  try {
    return JSON.parse(m[1]) as HealthBeacon
  } catch {
    return null
  }
}

export function deriveStatus(args: {
  surface: Surface
  clientSlug: string
  section: string
  httpStatus: number | null
  html: string
}): ProbeResult {
  const key = `${args.surface}:${args.clientSlug}:${args.section}`
  const base = { key, surface: args.surface, clientSlug: args.clientSlug, section: args.section }

  if (args.httpStatus === null || args.httpStatus < 200 || args.httpStatus >= 400) {
    return { ...base, status: 'down', detail: `HTTP ${args.httpStatus ?? 'fetch failed'}` }
  }
  const beacon = parseBeacon(args.html)
  if (!beacon) return { ...base, status: 'down', detail: 'no health beacon' }
  if (beacon.renderError) return { ...base, status: 'down', detail: beacon.renderError }
  const failed = beacon.sources.find((s) => !s.ok)
  if (failed) return { ...base, status: 'down', detail: `${failed.vendor}.${failed.fn}: ${failed.error ?? 'error'}` }
  return { ...base, status: 'ok' }
}
