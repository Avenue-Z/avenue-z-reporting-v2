// lib/organic-social/aeo-informed/fourth-graph.ts
// The client's fourth graph choice, on its own so the tab rule (lib/organic-social/aeo-tab/setting.ts, which lib/constants.ts and so the
// browser's sidebars import) can read the allowed values without pulling the adapter into the client bundle.

/** The outline's Instagram, or TikTok. Only the adapter platforms with a line color on the other Organic Social tabs that are not already
 *  graph 3 (LinkedIn); YouTube and Reddit have no color there (spec section 1). */
export type FourthGraph = 'instagram' | 'tiktok'
export const FOURTH_GRAPHS: readonly FourthGraph[] = ['instagram', 'tiktok']
