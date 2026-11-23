/** How each version in `ytd.parts.ts` pages in the PDF export: 'own' or 'block', as in `../export-layout.ts`.
 *  Plain values only, so `../export-layout.ts` can spread it without importing any part. Empty until the Year to date PR fills it. */
export const KIT_YTD_LAYOUT: Record<string, 'own' | 'block'> = {}
