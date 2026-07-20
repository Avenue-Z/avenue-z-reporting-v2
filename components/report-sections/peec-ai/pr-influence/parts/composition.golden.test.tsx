import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'

// registry.ts eagerly imports the sentiment-insights and pr-synopsis parts,
// which transitively import lib/db/client (throws at module init without
// DATABASE_URL). Same placeholder pattern as ctx.snapshot.test.ts /
// components/charts/capsule-column-chart.test.tsx.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'
})

import { PR_INFLUENCE_PARTS } from './registry'
import { PR_INFLUENCE_TEMPLATE } from '../template'
import { FIXTURE_PR_INFLUENCE_CTX } from './__fixtures__/pr-influence-ctx'

function renderComposition(ctx: typeof FIXTURE_PR_INFLUENCE_CTX, override: Parameters<typeof resolveSection>[1]) {
  const resolved = resolveSection(PR_INFLUENCE_TEMPLATE, override)
  return render(
    <TooltipProvider>
      <div className="space-y-8">
        {resolved.map((r) => {
          const impl = lookup(PR_INFLUENCE_PARTS, r.id, r.version)
          const node = impl?.render(ctx, r) ?? null
          return node == null ? null : <div key={`${r.id}@${r.version}`}>{node}</div>
        })}
      </div>
    </TooltipProvider>,
  )
}

test('default composition (no Profound account) renders 3 visible parts (synopsis + sentiment null)', () => {
  const { container } = renderComposition(FIXTURE_PR_INFLUENCE_CTX, undefined)
  const spaceY = container.querySelector('.space-y-8')!
  // 5 template parts minus pr-synopsis (SHOW_AI_NARRATIVE=false) minus sentiment (not profoundConfigured) = 3.
  expect(spaceY.children.length).toBe(3)
  expect(spaceY.firstElementChild?.innerHTML).not.toBe('')
  expect(spaceY).toMatchSnapshot()
})

test('a Profound-configured client renders 4 visible parts (sentiment appears)', () => {
  const ctx = { ...FIXTURE_PR_INFLUENCE_CTX, profoundConfigured: true }
  const { container } = renderComposition(ctx, undefined)
  expect(container.querySelector('.space-y-8')!.children.length).toBe(4)
  expect(container.textContent).toContain('Sentiment Insights')
})

test('hidden override drops sentiment-insights even when profoundConfigured', () => {
  const ctx = { ...FIXTURE_PR_INFLUENCE_CTX, profoundConfigured: true }
  const { container } = renderComposition(ctx, { hidden: ['sentiment-insights'] })
  // profoundConfigured would show 4, but the override removes sentiment before render -> 3.
  expect(container.querySelector('.space-y-8')!.children.length).toBe(3)
  expect(container.textContent).not.toContain('Sentiment Insights')
})
