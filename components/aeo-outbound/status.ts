// Status pills and per-row actions for the hub and editor (spec §10).
import type { DisplayStatus } from '@/lib/aeo-outbound/store'

export type HubAction = 'open' | 'copy' | 'revoke' | 'edit' | 'rerun' | 'discard'

export const STATUS_UI: Record<DisplayStatus, { label: string; className: string }> = {
  generating: { label: 'Generating', className: 'bg-white/10 text-white' },
  draft: { label: 'Draft', className: 'bg-[#FFFC60]/15 text-[#FFFC60]' },
  live: { label: 'Live', className: 'bg-[#60FF80]/15 text-[#60FF80]' },
  revoked: { label: 'Revoked', className: 'bg-white/5 text-text-muted' },
  failed: { label: 'Failed', className: 'bg-[#FF6B6B]/15 text-[#FF6B6B]' },
}

const ACTIONS: Record<DisplayStatus, readonly HubAction[]> = {
  generating: [],
  draft: ['open', 'rerun', 'discard'],
  live: ['open', 'copy', 'revoke', 'edit', 'rerun'],
  revoked: ['open', 'edit', 'rerun'],
  failed: ['rerun', 'discard'],
}

export function actionsFor(s: DisplayStatus): HubAction[] {
  return ACTIONS[s].slice()
}

export const snapshotUrl = (origin: string, token: string) => `${origin}/snapshot/${token}`
