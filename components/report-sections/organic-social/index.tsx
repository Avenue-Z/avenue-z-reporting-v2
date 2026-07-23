import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import type { DashChannel } from '@/lib/organic-social/metrics'
import { ORGANIC_SOCIAL_PARTS } from './parts/registry'
import { CODE_TEMPLATES } from './template'
import { buildOrganicSocialCtx } from './ctx'

export async function OrganicSocialReport({
  clientSlug, dateRange = 'last_30_days', compareRange = null, channel = null,
}: {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
  channel?: DashChannel | null
}) {
  const config = await getClientBySlug(clientSlug)
  const ctx = buildOrganicSocialCtx({ clientSlug, dateRange, compareRange, channel })
  const key = ctx.channel ? 'organic-social:platform' : 'organic-social'
  const template = (await getSectionTemplate(key)) ?? CODE_TEMPLATES[key]
  const resolved = resolveSection(template, config?.reportSectionConfig?.[key])
  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="organic-social" clientSlug={clientSlug} />
      {resolved.map((r) => {
        const impl = lookup(ORGANIC_SOCIAL_PARTS, r.id, r.version)
        const node = impl?.render(ctx, r) ?? null
        return node == null ? null : <div key={`${r.id}@${r.version}`}>{node}</div>
      })}
    </div>
  )
}
