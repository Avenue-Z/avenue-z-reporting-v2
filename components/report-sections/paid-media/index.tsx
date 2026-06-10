const DASHBOARD_URL = 'https://begin-health-dashboard.vercel.app'

export function PaidMediaReport() {
  return (
    <iframe
      src={DASHBOARD_URL}
      title="Begin Health — Paid Media Recap"
      className="block h-[calc(100vh-12rem)] w-full rounded-lg border border-white/[0.06] bg-bg-surface"
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      referrerPolicy="no-referrer-when-downgrade"
    />
  )
}
