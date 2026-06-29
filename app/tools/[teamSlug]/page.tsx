import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TEAMS } from '@/lib/constants'
import { ArrowRight, ArrowUpRight } from 'lucide-react'

const cardCls =
  'group relative flex items-center gap-4 rounded-lg border border-white/[0.06] bg-bg-surface p-5 transition-all hover:border-white/[0.12] hover:bg-white/[0.02]'

const arrowCls = 'h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100'

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

      {/* Tool cards: internal routes (leading '/') open in-app; external launch in a new tab. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {team.tools.map((tool) => {
          const isInternal = tool.url.startsWith('/')
          const body = (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{tool.name}</p>
                {tool.description && (
                  <p className="mt-0.5 text-xs text-text-muted">{tool.description}</p>
                )}
              </div>
              {isInternal ? <ArrowRight className={arrowCls} /> : <ArrowUpRight className={arrowCls} />}
            </>
          )
          return isInternal ? (
            <Link key={tool.slug} href={tool.url} className={cardCls}>
              {body}
            </Link>
          ) : (
            <a key={tool.slug} href={tool.url} target="_blank" rel="noopener noreferrer" className={cardCls}>
              {body}
            </a>
          )
        })}
      </div>
    </>
  )
}
