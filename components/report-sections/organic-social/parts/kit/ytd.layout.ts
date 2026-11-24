/** How each version in `ytd.parts.ts` pages in the PDF export: 'own' or 'block', as in `../export-layout.ts`.
 *  Plain values only, so `../export-layout.ts` can spread it without importing any part. */
export const KIT_YTD_LAYOUT: Record<string, 'own' | 'block'> = {
  'ytd-review@5': 'own',   // title kept with the first card, each card a block, as @2 (ytd-review-sheet.tsx)
}
