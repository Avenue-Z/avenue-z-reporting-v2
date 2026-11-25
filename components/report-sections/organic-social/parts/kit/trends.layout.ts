/** How each version in `trends.parts.ts` pages in the PDF export: 'own' or 'block', as in `../export-layout.ts`.
 *  Plain values only, so `../export-layout.ts` can spread it without importing any part. */
export const KIT_TRENDS_LAYOUT: Record<string, 'own' | 'block'> = {
  'follower-graph@3': 'own',     // title, legend and chart one block, then each annotation, as @2 (trends.tsx)
  'engagement-trend@3': 'own',
  'engagement-trend@4': 'own',
}
