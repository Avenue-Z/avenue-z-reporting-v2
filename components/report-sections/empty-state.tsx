import Link from 'next/link'

interface EmptyStateProps {
  platformName: string
  clientSlug: string
  isPortal?: boolean
}

export function EmptyState({ platformName, clientSlug, isPortal }: EmptyStateProps) {
  const authUrl = isPortal
    ? `/portal/${clientSlug}/auth`
    : `/dashboard/${clientSlug}/auth`

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-bg-surface/50 px-8 py-12 text-center">
      <p className="text-lg font-bold text-white">{platformName} not connected</p>
      <p className="mt-1 text-sm text-text-muted">
        Connect your {platformName} account to see data in this report.
      </p>
      <Link
        href={authUrl}
        className="mt-4 rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-6 py-2.5 text-sm font-extrabold uppercase tracking-wider text-black transition-opacity hover:opacity-90"
      >
        Connect {platformName}
      </Link>
    </div>
  )
}
