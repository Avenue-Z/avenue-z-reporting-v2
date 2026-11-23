/** How each version in `trends.parts.ts` pages in the PDF export: 'own' or 'block', as in `../export-layout.ts`.
 *  Plain values only, so `../export-layout.ts` can spread it without importing any part. Empty until the Trend graphs PR fills it. */
export const KIT_TRENDS_LAYOUT: Record<string, 'own' | 'block'> = {}
