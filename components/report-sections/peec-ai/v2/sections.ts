import type { ResolvedPart } from '@/lib/report-sections/types'

export type OverviewSectionId = '01' | '02' | '03' | '04' | '05'

export const OVERVIEW_SECTIONS: Record<OverviewSectionId, { label: string; headline: string; description: string }> = {
  '01': {
    label: 'SNAPSHOT KPIS',
    headline: 'How visible is the brand across AI answer engines?',
    description: 'Up to five headline KPIs, chosen per client by the AEO strategist.',
  },
  '02': {
    label: 'VISIBILITY VS COMPETITORS',
    headline: 'How has AI visibility grown this year?',
    description: 'Turn competitors on or off to compare trajectories, then see how every tracked brand ranks.',
  },
  '03': {
    label: 'PERFORMANCE BY AI MODEL',
    headline: 'How does brand performance vary across AI models?',
    description: 'One gauge per AI model, with the competitor average marked.',
  },
  '04': {
    label: 'TOPICS & PROMPTS',
    headline: 'Where is the brand winning and losing?',
    description: 'Visibility by topic, then every tracked prompt with its rank and change.',
  },
  '05': {
    label: 'CITED SOURCES',
    headline: 'Which pages do AI engines cite most?',
    description: "The URLs AI answers use as sources: yours, competitors' and third parties'.",
  },
}

type SectionMap = Readonly<Record<string, OverviewSectionId>>

/** Keyed `${id}@${version}`; later slices add entries. */
export const V2_PART_SECTIONS: SectionMap = {
  'visibility-chart@2': '02',
  'brand-rankings@2': '02',
  'llm-breakdown@2': '03',
  'topic-matrix@1': '04',
  'prompt-performance@1': '04',
}

const keyOf = (r: ResolvedPart) => `${r.id}@${r.version}`

export function isV2Layout(resolved: ResolvedPart[], map: SectionMap = V2_PART_SECTIONS): boolean {
  return resolved.some((r) => keyOf(r) in map)
}

export type PartGroup = { section: OverviewSectionId | null; showHeader: boolean; parts: ResolvedPart[] }

export function groupParts(resolved: ResolvedPart[], map: SectionMap = V2_PART_SECTIONS): PartGroup[] {
  const groups: PartGroup[] = []
  const seen = new Set<OverviewSectionId>()
  for (const r of resolved) {
    const section = map[keyOf(r)] ?? null
    const last = groups[groups.length - 1]
    if (last && last.section === section) {
      last.parts.push(r)
      continue
    }
    const showHeader = section !== null && !seen.has(section)
    if (section) seen.add(section)
    groups.push({ section, showHeader, parts: [r] })
  }
  return groups
}

export function sectionsPresent(groups: PartGroup[]): OverviewSectionId[] {
  const out: OverviewSectionId[] = []
  for (const g of groups) if (g.section && !out.includes(g.section)) out.push(g.section)
  return out
}
