import { Suspense } from 'react'
import { auth } from '@/auth'
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
  // Both async dependencies — the viewer-role read (`await auth()`) and the template/config lookup
  // (`getSectionTemplate` is a new critical-path dependency the data sections don't otherwise need)
  // — live inside OrganicSocialBody, behind a Suspense whose fallback IS the section skeletons, so
  // first paint no longer waits on either (PR #168 review R1 #6). `getClientBySlug` is React.cache-deduped.
  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="organic-social" clientSlug={clientSlug} />
      <Suspense fallback={<OverviewSkeleton />}>
        <OrganicSocialBody ctx={ctx} />
      </Suspense>
    </div>
  )
}

/** Resolves the viewer role, the composition (DB template + per-client override), and renders the
 *  parts. Async and isolated behind the Suspense above so its awaits don't gate first paint. */
export async function OrganicSocialBody({ ctx }: { ctx: OrganicSocialCtx }) {
  // Viewer role drives the internal-only designation toggle (top-content@2). Read defensively: a
  // failed session lookup must not blank the section, so keep ctx's safe client-role default.
  let role: string | undefined
  try { role = (await auth())?.user?.role } catch { role = undefined }
  const rctx: OrganicSocialCtx = role ? { ...ctx, role } : ctx
  const key = rctx.channel ? 'organic-social:platform' : 'organic-social'
  // Resolve the composition defensively. A DB hiccup here must NOT blank the whole section: on
  // failure, fall back to the in-code template with no per-client override so each part still
  // renders behind its own Suspense/safe() boundary (per-section isolation).
  let template = CODE_TEMPLATES[key]
  let override: SectionOverride | undefined
  try {
    // Two independent reads — run them together, not serialized.
    const [dbTemplate, config] = await Promise.all([
      getSectionTemplate(key),
      getClientBySlug(rctx.clientSlug),
    ])
    template = dbTemplate ?? CODE_TEMPLATES[key]
    override = config?.reportSectionConfig?.[key]
  } catch (e) {
    // Degrade, don't blank: keep the code-template fallback + no override so each part still
    // renders. Log it — otherwise a prod DB failure silently drops every render to the code
    // template and quietly stops applying per-client overrides with no signal at all.
    console.error(`[organic-social] template/config lookup failed for '${key}'; using code template`, e)
  }
  const resolved = resolveSection(template, override)
  return (
    <>
      {resolved.map((r) => {
        const impl = lookup(ORGANIC_SOCIAL_PARTS, r.id, r.version)
        const node = impl?.render(rctx, r) ?? null
        return node == null ? null : <div key={`${r.id}@${r.version}`}>{node}</div>
      })}
    </>
  )
}
