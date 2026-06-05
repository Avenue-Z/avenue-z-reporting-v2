import Link from 'next/link'
import { cn } from '@/lib/utils'
import { TEAMS } from '@/lib/constants'
import { ArrowRight } from 'lucide-react'

const AVATAR_COLORS = [
  'bg-brand-yellow text-black',
  'bg-brand-green text-black',
  'bg-brand-cyan text-black',
  'bg-brand-blue text-white',
  'bg-brand-purple text-white',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

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
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-bold',
                getAvatarColor(team.name)
              )}
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
