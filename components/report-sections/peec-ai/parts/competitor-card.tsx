// Card shell shared by the Overview competitor parts (competitor-visibility, competitor-gaps).

export function CompetitorCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      {/* In the PDF export the title stays on the page of what follows it. */}
      <div data-export-keep-with-next="">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function CompetitorCardSkeleton({ title }: { title: string }) {
  return (
    // "Still loading" to the PDF export's readiness check (lib/export/readiness.ts).
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6" data-export-pending="">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-white/[0.06]" />
        <div className="h-4 w-[92%] animate-pulse rounded bg-white/[0.06]" />
        <div className="h-4 w-[84%] animate-pulse rounded bg-white/[0.06]" />
      </div>
    </div>
  )
}
