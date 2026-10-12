import type { DashChannel } from '@/lib/organic-social/metrics'
import type { OrganicView } from '@/lib/constants'

export type OrganicSocialCtx = {
  clientSlug: string
  dateRange: string
  /** Already defaulted (see buildOrganicSocialCtx). Never null by the time a part reads it. */
  compareRange: string
  /** null = Overview (all allowlisted channels); otherwise the single channel in view. */
  channel: DashChannel | null
  /** 'influencer' on the Influencer tab (Instagram's influencer posts on their own page); null everywhere else.
   *  `channel` stays null there, so nothing treats that tab as a platform tab. */
  view: OrganicView
  /** Viewer role, for internal-only controls (the designation toggle, S2-B). Safe-defaulted
   *  to a client role so a missing session never exposes an edit control; the server action
   *  re-checks regardless. */
  role: string
  /** The viewer's email, set only when the session has one. Read only by the written notes on the
   *  v2 graphs (Commentary's email rules, lib/commentary/permissions.ts); every other part ignores
   *  it. */
  email?: string
}

/** Synchronous, total; no I/O, no throwing. `channel` is ALREADY resolved by the route (M3). */
export function buildOrganicSocialCtx(args: {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
  channel: DashChannel | null
  view?: OrganicView
  role?: string
}): OrganicSocialCtx {
  return {
    clientSlug: args.clientSlug,
    dateRange: args.dateRange ?? 'last_30_days',
    compareRange: args.compareRange ?? 'previous_period',
    channel: args.channel,
    view: args.view ?? null,
    role: args.role ?? 'CLIENT_VIEWER',
  }
}
