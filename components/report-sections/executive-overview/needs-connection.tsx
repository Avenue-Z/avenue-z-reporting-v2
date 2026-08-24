interface NeedsConnectionProps {
  sourceName: string
}

/**
 * Block-scale placeholder for a data source this client has not connected.
 * Deliberately renders no number: a zero or a dash here would read as real
 * data meaning "none", which is the failure this page exists to avoid.
 *
 * Adapted from components/report-sections/empty-state.tsx with the call to
 * action removed, since there is no auth route to send anyone to.
 *
 * sourceName is passed 'CRM' on this page. On-screen copy deliberately does
 * not name a vendor: the client is on one CRM today and may move to another,
 * and a client-facing report should not need editing when they do. Dropping it also drops the clientSlug and isPortal
 * props, neither of which a report section can obtain.
 */
export function NeedsConnection({ sourceName }: NeedsConnectionProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-bg-surface/50 px-8 py-12 text-center">
      <p className="text-lg font-bold text-white">{sourceName} not connected</p>
      <p className="mt-1 text-sm text-text-muted">
        Connect your {sourceName} to see this data in the report.
      </p>
    </div>
  )
}
