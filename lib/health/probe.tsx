import type { ReactElement } from 'react'
import { runWithCollector, getCollected } from './collector'
import { ReportHealthBeacon } from './beacon'
import type { HealthBeacon, Surface } from './types'

/**
 * Health-mode renderer for one report page. Invokes the section's async
 * server-component body directly and awaits it to completion so its cached()
 * data fetches run and record into the active collector before we read it —
 * this is why health mode does not stream (no <Suspense>): we need a complete,
 * deterministic collector when we emit the beacon. The component's returned
 * tree is discarded; only the fetch side-effects matter.
 */
export async function HealthProbe({
  surface,
  clientSlug,
  section,
  element,
}: {
  surface: Surface
  clientSlug: string
  section: string
  element: ReactElement
}) {
  return runWithCollector(async () => {
    let renderError: string | undefined
    try {
      const type = element.type
      if (typeof type === 'function') {
        await (type as (props: unknown) => unknown)(element.props)
      }
    } catch (e) {
      renderError = e instanceof Error ? e.message : String(e)
    }
    const beacon: HealthBeacon = {
      surface,
      clientSlug,
      section,
      sources: getCollected(),
      ...(renderError ? { renderError } : {}),
    }
    return <ReportHealthBeacon beacon={beacon} />
  })
}
