import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'
import { Megaphone } from 'lucide-react'
import { SectionHeader } from './section-header'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import type { AEOModel } from '@/lib/peec/models'
import { buildPrInfluenceCtx } from './pr-influence/ctx'
import { PR_INFLUENCE_PARTS } from './pr-influence/parts/registry'
import { PR_INFLUENCE_TEMPLATE } from './pr-influence/template'

// ---------------------------------------------------------------------------
// PR Influence on AI Visibility
// PRD Sections A-F -- FULL SPEC IMPLEMENTATION
//
// Live data:  Peec AI (visibility, position, citations, editorial domains,
//             prompt cluster gap analysis)
//             PR Proof Library (Google Sheet -- PR placement log)
//             GA4 (AI referral sessions via AI_REFERRER_DOMAINS filter)
// Cross-ref:  PR placement domains matched against Peec editorial citation data
//
// Body composition (order, hide/show, versions) is resolved via the parts
// registry/template rather than hardcoded JSX -- see ./pr-influence/parts.
// ---------------------------------------------------------------------------

// ── Main RSC ─────────────────────────────────────────────────────────────────

export async function PRInfluenceReport({ clientSlug, dateRange = 'last_30_days', models = null }: { clientSlug: string; dateRange?: string; models?: AEOModel[] | null }) {
  const config = await getClientBySlug(clientSlug)
  const ctx = await buildPrInfluenceCtx({ clientSlug, dateRange, models })
  const template = (await getSectionTemplate('peec-ai:pr-influence')) ?? PR_INFLUENCE_TEMPLATE
  const override = config?.reportSectionConfig?.['peec-ai:pr-influence']
  const resolved = resolveSection(template, override)

  return (
    <div className="space-y-8">

      <SharedPartsHeader viewKey="peec-ai:pr-influence" clientSlug={clientSlug} />

      <SectionHeader
        icon={Megaphone}
        title="How is AI-driven PR coverage performing?"
        subtitle="Where earned media earns LLM citations, which publications carry the most AI authority, and the opportunities to grow share of voice."
      />

      {resolved.map((r) => {
        const impl = lookup(PR_INFLUENCE_PARTS, r.id, r.version)
        const node = impl?.render(ctx, r) ?? null
        return node == null ? null : <div key={`${r.id}@${r.version}`}>{node}</div>
      })}
    </div>
  )
}
