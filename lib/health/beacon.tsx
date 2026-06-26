import type { HealthBeacon } from './types'

/**
 * Renders the collected health for one page as inline JSON the sweep reads.
 * The `<` escape prevents an error string containing "</script>" from breaking
 * out of the tag. This is inert data, never executed.
 */
export function ReportHealthBeacon({ beacon }: { beacon: HealthBeacon }) {
  const json = JSON.stringify(beacon).replace(/</g, '\\u003c')
  return (
    <script
      id="report-health"
      type="application/json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
