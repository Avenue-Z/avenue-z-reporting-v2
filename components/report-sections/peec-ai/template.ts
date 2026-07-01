import type { SectionTemplate } from '@/lib/report-sections/types'

// The AEO section's default composition, all parts at v1. Order MUST match the current
// hardcoded ProviderSection sequence so the seeded template reproduces today's report.
// (See components/report-sections/peec-ai/index.tsx ProviderSection.)
export const PEEC_TEMPLATE: SectionTemplate = {
  order: [
    { id: 'overview-synopsis', version: 1 },
    { id: 'kpi-cards', version: 1 },
    { id: 'visibility-chart', version: 1 },
    { id: 'llm-breakdown', version: 1 },
    { id: 'winners-losers', version: 1 },
    { id: 'brand-rankings', version: 1 },
    { id: 'domains-row', version: 1 },
    { id: 'footer', version: 1 },
  ],
  labels: {
    'kpi-cards': 'Snapshot KPIs',
  },
  thresholds: {},
}
