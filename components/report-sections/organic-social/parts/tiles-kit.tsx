// The tiles' design kit part versions (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 2 and 5):
// platform-headlines@6 (from @1), @4 (from @2), @5 (from @3) and engagement-breakdown@2 (from @1).
//
// Each one is the old version's own `render` with one thing swapped: the section inside its Suspense becomes the kit
// section, which awaits the old section and redraws only its tiles (kit-tiles.tsx `asKit`). So which tabs fall back,
// the skeleton, the requests (including the outline fallback's size-based change), the sheet read, the logs and the
// fallback cards are all the old code, not a copy of it. All unpublished: pinned per client, never promoted into the
// shared template or frozen into a snapshot.
import { Suspense, isValidElement, type ComponentProps, type FC, type ReactNode } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../ctx'
import { HeadlinesSection, platformHeadlinesV1 } from './platform-headlines'
import { OutlineDataSection, platformHeadlinesV2, platformHeadlinesV3 } from './outline-data'
import { BreakdownSection, engagementBreakdownV1 } from './engagement-breakdown'
import { asKit } from './kit-tiles'

export async function KitHeadlinesSection(props: ComponentProps<typeof HeadlinesSection>) {
  return asKit(await HeadlinesSection(props))
}
export async function KitOutlineDataSection(props: ComponentProps<typeof OutlineDataSection>) {
  return asKit(await OutlineDataSection(props))
}
export async function KitBreakdownSection(props: ComponentProps<typeof BreakdownSection>) {
  return asKit(await BreakdownSection(props))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const KIT_SECTION = new Map<unknown, FC<any>>([
  [HeadlinesSection, KitHeadlinesSection],
  [OutlineDataSection, KitOutlineDataSection],
  [BreakdownSection, KitBreakdownSection],
])

/** An old part's rendered element with its section swapped for the kit's: `<Suspense fallback><Section .../></Suspense>`
 *  keeps its fallback and its section's props exactly. Anything else (null on a tab the part does not cover) passes
 *  through as it is. Matched by component, so an old render that one day returned another shape would pass through
 *  unkitted, and the tests (which look for the kit's classes) would fail. */
export function withKitSection(node: ReactNode): ReactNode {
  if (!isValidElement(node) || node.type !== Suspense) return node
  const { fallback, children } = node.props as { fallback: ReactNode; children: ReactNode }
  if (!isValidElement(children)) return node
  const Kit = KIT_SECTION.get(children.type)
  return Kit ? <Suspense fallback={fallback}><Kit {...(children.props as object)} /></Suspense> : node
}

function kitOf(old: PartImpl<OrganicSocialCtx>, version: number): PartImpl<OrganicSocialCtx> {
  return {
    id: old.id,
    version,
    published: false,
    defaultLabel: old.defaultLabel,
    // The old renders take ctx only (none reads the resolved part), so it passes straight through.
    render: (ctx, resolved) => withKitSection(old.render(ctx, resolved)),
  }
}

/** The v1 tiles (Overview's, and Renaissance's platform tabs today) with the kit. */
export const platformHeadlinesV6 = kitOf(platformHeadlinesV1, 6)
/** The outline Data block (standard rows) with the kit. On Overview or an uncovered channel @2 shows the v1 tiles with
 *  whole numbers; @4 shows @6's kit tiles the same way. */
export const platformHeadlinesV4 = kitOf(platformHeadlinesV2, 4)
/** The same with Profile Clicks on Instagram (Kenect Nashville), with the kit. */
export const platformHeadlinesV5 = kitOf(platformHeadlinesV3, 5)
/** The engagement breakdown under the engagement graph, with the kit. Nothing on Overview or an uncovered channel. */
export const engagementBreakdownV2 = kitOf(engagementBreakdownV1, 2)
