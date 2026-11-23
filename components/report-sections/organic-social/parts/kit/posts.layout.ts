/** How each version in `posts.parts.ts` pages in the PDF export: 'own' or 'block', as in `../export-layout.ts`.
 *  Plain values only, so `../export-layout.ts` can spread it without importing any part. Empty until the Posts PR fills it. */
export const KIT_POSTS_LAYOUT: Record<string, 'own' | 'block'> = {}
