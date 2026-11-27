// The design kit's look for the controls the artifact has no equivalent for (plan
// docs/superpowers/plans/2026-11-24-os-design-round3.md, Task 1; decision (d) of the round 2 plan): they keep how they
// work and take only the kit's pill and button styles. A plain module, with no 'use client' (like chart-look.ts), so
// server and client modules can both call it. Without the look each returns today's exact string, so a control drawn
// without the kit is byte-identical to before.
import kit from './design/kit.module.css'
import { CARD_PILL, PILL } from './pill'

export type ControlLook = 'kit' | undefined

/** A note button (Save draft, Cancel): today's small rounded button, or the kit's small button. */
export const noteButton = (look: ControlLook) => (look === 'kit' ? kit.tbtn : PILL)

/** A card button (Hide, Edit, Approve, Revoke, Delete): the same, and on either look it never prints and never wraps (a
 *  floating card clipped its buttons when they wrapped, annotation-callouts.tsx). */
export const cardButton = (look: ControlLook) => (look === 'kit' ? `no-print whitespace-nowrap ${kit.tbtn}` : CARD_PILL)

/** A note field (the text input, the day or month select): `old` as it is, or the kit's field colours and border with
 *  the size every note field has today. The caller appends its own extra classes (width) to either. */
export const field = (look: ControlLook, old: string) => (look === 'kit' ? `${kit.field} px-2 py-1 text-xs` : old)

/** A note form's box: today's, or the same box on the kit's border and darker fill. `lead` is the box's own first
 *  classes (the daily form's `no-print`), kept on both looks. */
export const noteBox = (look: ControlLook, lead: string) =>
  `${lead}w-full space-y-2 rounded-lg border ${look === 'kit' ? 'border-[var(--border)] bg-[var(--subtle)]' : 'border-white/[0.08] bg-white/[0.03]'} p-3`
