import { Suspense } from 'react'
import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import type { DashChannel } from '@/lib/organic-social/metrics'
import type { SectionOverride } from '@/lib/report-sections/types'
import { ORGANIC_SOCIAL_PARTS } from './parts/registry'
import { CODE_TEMPLATES } from './template'
import { buildOrganicSocialCtx, type OrganicSocialCtx } from './ctx'
import { OverviewSkeleton } from './skeletons'

export function OrganicSocialReport({
  clientSlug, dateRange = 'last_30_days', compareRange = null, channel = null,
}: {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
  channel?: DashChannel | null
}) {
  const ctx = buildOrganicSocialCtx({ clientSlug, dateRange, compareRange, channel })
  // The outer component is SYNCHRONOUS so the section's own skeletons paint on first render.
  // The template/config lookup — `getSectionTemplate` is a new critical-path dependency the three
  // data sections don't otherwise need — is deferred into OrganicSocialBody behind a Suspense
  // whose fallback IS the section skeletons, so first paint no longer waits on that DB round-trip
  // (PR #168 review R1 #6). `getClientBySlug` inside SharedPartsHeader is React.cache-deduped.
  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="organic-social" clientSlug={clientSlug} />
      <Suspense fallback={<OverviewSkeleton />}>
        <OrganicSocialBody ctx={ctx} />
      </Suspense>
    </div>
  )
}

/** Resolves the composition (DB template + per-client override) and renders the parts. Async and
 *  isolated behind the Suspense above so its awaits don't gate the section's first paint. */
export async function OrganicSocialBody({ ctx }: { ctx: OrganicSocialCtx }) {
  const key = ctx.channel ? 'organic-social:platform' : 'organic-social'
  // Resolve the composition defensively. A DB hiccup here must NOT blank the whole section: on
  // failure, fall back to the in-code template with no per-client override so each part still
  // renders behind its own Suspense/safe() boundary (per-section isolation).
  let template = CODE_TEMPLATES[key]
  let override: SectionOverride | undefined
  try {
    template = (await getSectionTemplate(key)) ?? CODE_TEMPLATES[key]
    const config = await getClientBySlug(ctx.clientSlug)
    override = config?.reportSectionConfig?.[key]
  } catch {
    // keep code-template fallback + no override
  }
  const resolved = resolveSection(template, override)
  return (
    <>
      {resolved.map((r) => {
        const impl = lookup(ORGANIC_SOCIAL_PARTS, r.id, r.version)
        const node = impl?.render(ctx, r) ?? null
        return node == null ? null : <div key={`${r.id}@${r.version}`}>{node}</div>
      })}
    </>
  )
}
