/** How each version in `posts.parts.ts` pages in the PDF export: 'own' or 'block', as in `../export-layout.ts`.
 *  Plain values only, so `../export-layout.ts` can spread it without importing any part. */
export const KIT_POSTS_LAYOUT: Record<string, 'own' | 'block'> = {
  'top-content@4': 'own',         // rows of five cards, as @3 (sortable-top-content.tsx)
  'top-content@5': 'own',         // as @2
  'influencer-posts@2': 'own',    // heading and totals with the first row, rows of two cards, as @1 (influencer-grid.tsx)
}
