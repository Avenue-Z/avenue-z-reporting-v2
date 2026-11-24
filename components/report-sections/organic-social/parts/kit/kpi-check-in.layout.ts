/** How each version in `kpi-check-in.parts.ts` pages in the PDF export: 'own' or 'block', as in `../export-layout.ts`.
 *  Plain values only, so `../export-layout.ts` can spread it without importing any part. */
export const KIT_KPI_CHECK_IN_LAYOUT: Record<string, 'own' | 'block'> = {
  'kpi-check-in@2': 'own',   // each platform card a block, the heading in the first, as @1 (kpi-check-in.tsx)
}
