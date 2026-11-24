// The KPI Check-In's design kit part version (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 9):
// kpi-check-in@2 (from @1). Each platform sits in a kit card; the rings keep their look and colours (decision (d); the
// artifact has no rings), and the start line, the staff notes and the released-month rule behave as in @1.
//
// It awaits the real @1 section (kpi-check-in.tsx) and walks the tree it returns, including both views a staff member's
// PrintAsClient carries (the live view, and the client view the PDF prints): only each platform card's frame becomes the
// kit's card. So the sheet reads, the rows, the start line, the notes, the logs and the fallback cards are @1's code, not
// a copy of it. Unpublished: pinned per client, never promoted into the shared template or frozen into a snapshot.
import { Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import kit from '../design/kit.module.css'
import { kpiCheckInV1 } from './kpi-check-in'
import { PrintAsClient } from './print-as-client'
import { kitOf, redrawnSections } from './kit-swap'

type El = ReactElement<Record<string, unknown>>

/** @1's platform card frame (kpi-check-in.tsx, the card inside each platform's block). kpi-kit.test.tsx counts these
 *  against the kit cards, so a change to @1's card that this no longer matches fails there. */
const OLD_CARD = 'rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5'

/** One element of a returned KPI tree in kit form. Only host elements, fragments and PrintAsClient are walked into; any
 *  other component (the rings, a fallback card) is left exactly as it is. */
function kitKpi(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(kitKpi)
  if (!isValidElement(node)) return node
  const el = node as El
  const p = el.props
  if (el.type === PrintAsClient) return cloneElement(el, { live: kitKpi(p.live as ReactNode), client: kitKpi(p.client as ReactNode) })
  if (typeof el.type === 'string' || el.type === Fragment) {
    const swapped = el.type === 'div' && p.className === OLD_CARD ? { className: kit.card } : undefined
    const kids = p.children as ReactNode
    if (kids === undefined) return swapped ? cloneElement(el, swapped) : el
    return Array.isArray(kids) ? cloneElement(el, swapped, ...kids.map(kitKpi)) : cloneElement(el, swapped, kitKpi(kids))
  }
  return el
}

/** The section's answer in kit form: the block, or a staff member's two views, inside the kit's colours. A fallback
 *  card or nothing passes through as it is. */
function kitKpiBlock(node: ReactNode): ReactNode {
  if (isValidElement(node) && (node.type === 'section' || node.type === PrintAsClient)) return <div className={kit.root}>{kitKpi(node)}</div>
  return node
}

/** Each section's kit form, made once per section (kit-swap.tsx), so a re-render never remounts the block. Anything
 *  else (null off Overview) passes through. */
const { kitFor } = redrawnSections(kitKpiBlock)

/** The KPI Check-In, each platform in a kit card. */
export const kpiCheckInV2 = kitOf(kpiCheckInV1, 2, kitFor)
