import Link from 'next/link'
import { TEAMS } from '@/lib/constants'
import { ArrowRight } from 'lucide-react'

export default function ToolsPage() {
  return (
    <>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Tools</h1>
        <p className="mt-1 text-sm text-text-muted">
          Select a team to view its tools.
        </p>
      </div>

      {/* Team cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEAMS.map((team) => (
          <Link
            key={team.slug}
            href={`/tools/${team.slug}`}
            className="group relative flex items-center gap-4 rounded-lg border border-white/[0.06] bg-bg-surface p-5 transition-all hover:border-white/[0.12] hover:bg-white/[0.02]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-extrabold text-black"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF, #39A0FF, #6034FF)',
              }}
            >
              {team.name.charAt(0).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{team.name}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {team.tools.length} tool{team.tools.length !== 1 ? 's' : ''}
              </p>
            </div>

            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </>
  )
}
