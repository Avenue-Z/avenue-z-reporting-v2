'use client'
// The Brand and Industry pills and staff's "Preview as client", as the approved mockup draws them
// (docs/social-listening/mock.template.html: .topics, .pill, #preview-toggle). Each sets its URL param and keeps every
// other one, as the AEO tab's controls do; the default removes it. The PDF prints both topics, so none of this is there.
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import type { SlTopic } from '@/lib/organic-social/social-listening/types'
import s from '../design/kit.module.css'

function useSetParam() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (name: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null) params.delete(name)
    else params.set(name, value)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
}

export function TopicPills({ topic, industry, brandLabel, industryLabel }: { topic: SlTopic; industry: boolean; brandLabel: string; industryLabel: string }) {
  const exportMode = useExportMode()
  const setParam = useSetParam()
  if (exportMode) return null
  const pill = (t: SlTopic, label: string, dot: string) => (
    <button key={t} type="button" className={s.pill} aria-pressed={topic === t} onClick={() => setParam('sl', t === 'brand' ? null : t)}>
      <span className={s.dot} style={{ background: dot }} />{label}
    </button>
  )
  return (
    <div className={s.topics} role="group" aria-label="Topic">
      {pill('brand', brandLabel, '#60FDFF')}
      {industry && pill('industry', industryLabel, '#6034FF')}
    </div>
  )
}

/** Staff's "Preview as client": sets `slview=client`; "Back to editing" removes it. Staff only, never in the PDF. */
export function PreviewToggle({ on }: { on: boolean }) {
  const exportMode = useExportMode()
  const setParam = useSetParam()
  if (exportMode) return null
  return (
    <button type="button" className={s.btn} aria-pressed={on} onClick={() => setParam('slview', on ? null : 'client')}>
      {on ? 'Back to editing' : 'Preview as client'}
    </button>
  )
}
