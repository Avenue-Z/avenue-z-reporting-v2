import type { DashChannel } from '@/lib/organic-social/metrics'

export type OrganicSocialCtx = {
  clientSlug: string
  dateRange: string
  /** Already defaulted (see buildOrganicSocialCtx). Never null by the time a part reads it. */
  compareRange: string
  /** null = Overview (all allowlisted channels); otherwise the single channel in view. */
  channel: DashChannel | null
}

/** Synchronous, total; no I/O, no throwing. `channel` is ALREADY resolved by the route (M3). */
export function buildOrganicSocialCtx(args: {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
  channel: DashChannel | null
}): OrganicSocialCtx {
  return {
    clientSlug: args.clientSlug,
    dateRange: args.dateRange ?? 'last_30_days',
    compareRange: args.compareRange ?? 'previous_period',
    channel: args.channel,
  }
}
