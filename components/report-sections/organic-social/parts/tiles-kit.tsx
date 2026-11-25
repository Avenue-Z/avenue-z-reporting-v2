// The tiles' design kit part versions (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 2 and 5):
// platform-headlines@6 (from @1), @4 (from @2), @5 (from @3) and engagement-breakdown@2 (from @1).
//
// Each one is the old version's own `render` with one thing swapped: the section inside its Suspense becomes the kit
// section, which awaits the old section and redraws only its tiles (kit-tiles.tsx `asKit`). So which tabs fall back,
// the skeleton, the requests (including the outline fallback's size-based change), the sheet read, the logs and the
// fallback cards are all the old code, not a copy of it. All unpublished: pinned per client, never promoted into the
// shared template or frozen into a snapshot.
import type { ComponentProps, FC } from 'react'
import { HeadlinesSection, platformHeadlinesV1 } from './platform-headlines'
import { OutlineDataSection, platformHeadlinesV2, platformHeadlinesV3 } from './outline-data'
import { BreakdownSection, engagementBreakdownV1 } from './engagement-breakdown'
import { asKit } from './kit-tiles'
import { kitOf, type KitFor } from './kit-swap'

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

/** Matched by component, so an old render that one day returned another section would pass through unkitted, and the
 *  tests (which look for the kit's classes) would fail. */
const kitFor: KitFor = (section) => KIT_SECTION.get(section)

/** The v1 tiles (Overview's, and Renaissance's platform tabs today) with the kit. */
export const platformHeadlinesV6 = kitOf(platformHeadlinesV1, 6, kitFor)
/** The outline Data block (standard rows) with the kit. On Overview or an uncovered channel @2 shows the v1 tiles with
 *  whole numbers; @4 shows @6's kit tiles the same way. */
export const platformHeadlinesV4 = kitOf(platformHeadlinesV2, 4, kitFor)
/** The same with Profile Clicks on Instagram (Kenect Nashville), with the kit. */
export const platformHeadlinesV5 = kitOf(platformHeadlinesV3, 5, kitFor)
/** The engagement breakdown under the engagement graph, with the kit. Nothing on Overview or an uncovered channel. */
export const engagementBreakdownV2 = kitOf(engagementBreakdownV1, 2, kitFor)
