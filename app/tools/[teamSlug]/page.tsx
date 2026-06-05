import { notFound } from 'next/navigation'
import { TEAMS } from '@/lib/constants'
import { ArrowUpRight } from 'lucide-react'

export default async function TeamToolsPage({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  const { teamSlug } = await params
  const team = TEAMS.find((t) => t.slug === teamSlug)
  if (!team) notFound()

  return (
    <>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{team.name}</h1>
        <p className="mt-1 text-sm text-text-muted">
          Tools available to the {team.name} team.
        </p>
      </div>

      {/* Tool cards (external links) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {team.tools.map((tool) => (
          <a
            key={tool.slug}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center gap-4 rounded-lg border border-white/[0.06] bg-bg-surface p-5 transition-all hover:border-white/[0.12] hover:bg-white/[0.02]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{tool.name}</p>
              {tool.description && (
                <p className="mt-0.5 text-xs text-text-muted">{tool.description}</p>
              )}
            </div>

            <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        ))}
      </div>
    </>
  )
}
