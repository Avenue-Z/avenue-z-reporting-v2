// What each design kit version draws (spec docs/superpowers/specs/2026-11-24-os-design-past-months.md, section 3).
// Every kit version is the old version's own render with its frame swapped, so for a month before a client's
// `designFrom` the page draws the old version itself (option B). Read from the code, and held to the registries by
// kit-wraps.test.ts both ways. Pure data: no import from components/, so lib code can use it.

type Wraps = Readonly<Record<string, Readonly<Record<number, number>>>>

/** Organic Social parts: part id, then kit version to the version it wraps. */
export const KIT_WRAPS: Wraps = {
  'platform-headlines': { 4: 2, 5: 3, 6: 1 }, // parts/tiles-kit.tsx
  'engagement-breakdown': { 2: 1 }, // parts/tiles-kit.tsx
  'follower-graph': { 3: 2 }, // parts/trends-kit.tsx
  'engagement-trend': { 3: 2, 4: 1 }, // parts/trends-kit.tsx
  'ytd-review': { 5: 2 }, // parts/ytd-kit.tsx
  'top-content': { 4: 3, 5: 2 }, // parts/posts-kit.tsx
  'influencer-posts': { 2: 1 }, // parts/posts-kit.tsx
  'kpi-check-in': { 2: 1 }, // parts/kpi-kit.tsx
}

/** The two shared boxes (components/report-sections/shared/parts/registry.tsx). Their look is gated by `look`, not by
 *  this table; it is here for the pin check (kit-pin-check.ts). */
export const SHARED_KIT_WRAPS: Wraps = {
  commentary: { 2: 1 },
  recommendations: { 2: 1 },
}

/** The version a part draws: `version` itself when the kit applies to the month, else the version a kit version wraps.
 *  A version that is not a kit version is returned as it is, so a client without kit pins never changes. */
export function drawnVersion(id: string, version: number, kitActive: boolean): number {
  if (kitActive) return version
  return KIT_WRAPS[id]?.[version] ?? version
}
