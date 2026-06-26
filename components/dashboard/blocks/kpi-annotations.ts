/** Decide which color band a KPI value falls into. Ceiling wins over target.
 *  - value ≥ ceiling          → 'ceiling' (orange)
 *  - value ≥ target & < ceil  → 'target'  (green)
 *  - otherwise                → null      (default white) */
export function kpiAnnotationColor(
  value: number,
  target?: number,
  ceiling?: number,
): 'target' | 'ceiling' | null {
  if (!Number.isFinite(value)) return null
  if (ceiling !== undefined && value >= ceiling) return 'ceiling'
  if (target !== undefined && value >= target) return 'target'
  return null
}

/** Tailwind class to apply to the KPI value text for each band. Literal hex
 *  matches the design spec (ceiling: paid-search accent orange; target: brand-green). */
export const KPI_ANNOTATION_CLASS: Record<'target' | 'ceiling', string> = {
  target: 'text-[#5DD39E]',
  ceiling: 'text-[#FF8A3D]',
}
