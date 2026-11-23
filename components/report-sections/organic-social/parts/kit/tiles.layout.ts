/** How each version in `tiles.parts.ts` pages in the PDF export: 'own' or 'block', as in `../export-layout.ts`.
 *  Plain values only, so `../export-layout.ts` can spread it without importing any part. Empty until the Tiles PR fills it. */
export const KIT_TILES_LAYOUT: Record<string, 'own' | 'block'> = {}
