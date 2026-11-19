'use client'
// The Brand and Industry pills. Each sets the `sl` URL param and keeps every other one, as the AEO tab's controls do
// (aeo-informed/controls.tsx); Brand, the default, removes it. The PDF prints both topics, so there are no pills there.
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useExportMode } from '@/components/export/export-mode'
import type { SlTopic } from '@/lib/organic-social/social-listening/types'

export function TopicPills({ topic, industry, brandLabel, industryLabel }: { topic: SlTopic; industry: boolean; brandLabel: string; industryLabel: string }) {
  const exportMode = useExportMode()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (exportMode) return null
  const go = (t: SlTopic) => {
    const params = new URLSearchParams(searchParams.toString())
    if (t === 'brand') params.delete('sl')
    else params.set('sl', t)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
  const pill = (t: SlTopic, label: string, dot: string) => (
    <button key={t} type="button" aria-pressed={topic === t} onClick={() => go(t)}
      className={cn('inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
        topic === t ? 'border-white/30 bg-white/[0.12] text-white' : 'border-white/10 text-text-muted hover:text-white')}>
      <i className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />{label}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Topic">
      {pill('brand', brandLabel, '#60FDFF')}
      {industry && pill('industry', industryLabel, '#6034FF')}
    </div>
  )
}

/** Staff's "Preview as client" (the approved mockup's toggle). Sets `slview=client` and keeps every other param; "Back to
 *  editing" removes it. Rendered for staff only, never in the PDF. */
export function PreviewToggle({ on }: { on: boolean }) {
  const exportMode = useExportMode()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (exportMode) return null
  const flip = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (on) params.delete('slview')
    else params.set('slview', 'client')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
  return (
    <button type="button" aria-pressed={on} onClick={flip}
      className={cn('rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition-colors',
        on ? 'border-[#60FDFF] text-[#60FDFF]' : 'border-white/10 bg-bg-surface text-white hover:border-white/30')}>
      {on ? 'Back to editing' : 'Preview as client'}
    </button>
  )
}
