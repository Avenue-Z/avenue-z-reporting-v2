/** How each version in `tiles.parts.ts` pages in the PDF export: 'own' or 'block', as in `../export-layout.ts`.
 *  Plain values only, so `../export-layout.ts` can spread it without importing any part. */
export const KIT_TILES_LAYOUT: Record<string, 'own' | 'block'> = {
  'platform-headlines@4': 'own',   // the Data block, its heading and tiles one block, as @2 (kit-tiles.tsx)
  'platform-headlines@5': 'own',
  'platform-headlines@6': 'own',   // each platform's label and tiles one block, as @1
  'engagement-breakdown@2': 'block', // one row of tiles, wrapped whole by the report, as @1
}
