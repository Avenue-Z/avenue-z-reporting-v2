// Why a generation failed, as a code the UI turns into plain words (spec v1.1 §7). A code travels on the error object
// (PeecError.code) or the generation result, never parsed from message text.
export const ERROR_CODES = [
  'no_project', 'own_brand_count', 'no_data', 'own_brand_no_row', 'zero_retrievals', 'history_too_long', 'timeout',
  'copy_failed', 'copy_outside_sources', 'peec_error', 'contract_violation', 'stale', 'internal',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]
/** The codes a PeecError can carry. An HTTP or transport failure carries none and is reported as peec_error. */
export type PeecErrorCode = 'no_project' | 'own_brand_count' | 'no_data' | 'own_brand_no_row' | 'zero_retrievals' | 'history_too_long' | 'contract_violation'
export const isErrorCode = (v: unknown): v is ErrorCode => typeof v === 'string' && (ERROR_CODES as readonly string[]).includes(v)
