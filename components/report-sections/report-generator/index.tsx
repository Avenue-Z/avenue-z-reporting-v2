import { getClientBySlug } from '@/lib/db/queries'
import { REPORT_NAMES } from '@/lib/constants'
import { fetchDataSnapshot } from '@/lib/report-generator/context'
import { GeneratorInterface } from './generator-interface'

// Slugs that are tools/meta sections, not data channels
const NON_CHANNEL_SLUGS = new Set([
  'exec-summary',
  'demand-overview',
  'blended-performance',
  'ai-summaries',
  'report-generator',
  'ffci',
  'pr-placements',
  'profound-ai',
])

interface ReportGeneratorProps {
  clientSlug: string
}

export async function ReportGeneratorReport({ clientSlug }: ReportGeneratorProps) {
  const client = await getClientBySlug(clientSlug)
  if (!client) return null

  const activeChannels = client.enabledReports
    .filter((slug) => !NON_CHANNEL_SLUGS.has(slug))
    .map((slug) => REPORT_NAMES[slug] ?? slug)

  // Fetch live data snapshot from all connected channels in parallel.
  // Each channel fetch is individually try/caught inside fetchDataSnapshot —
  // a missing env var or API error on one channel never blocks the others.
  const snapshot = await fetchDataSnapshot(clientSlug)

  return (
    <GeneratorInterface
      clientName={client.name}
      activeChannels={activeChannels}
      snapshot={snapshot}
    />
  )
}
