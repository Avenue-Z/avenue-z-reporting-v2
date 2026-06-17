import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// Canonical AEO section header. All four AEO tabs (Overview, PR Influence,
// Content Impact, Technical Performance) must use this so the treatment stays
// consistent. Tabs vary the icon and copy; visual treatment is fixed here.
// See docs/official-feedback/feedback-log.md FB-001.

type Props = {
  icon: LucideIcon
  title: string
  subtitle: string
  badge?: ReactNode
}

export function SectionHeader({ icon: Icon, title, subtitle, badge }: Props) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#60FF80]/10">
        <Icon className="h-5 w-5 text-[#60FF80]" />
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {badge}
        </div>
        <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>
      </div>
    </div>
  )
}
