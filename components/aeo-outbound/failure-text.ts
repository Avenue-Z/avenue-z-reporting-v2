// A failed generation's reason in plain words with the next step (spec v1.1 §7). The code travels on the row; the UI knows
// the row id. A row with no code (generated before v1.1) or a code this build does not know shows its stored text.
import { MAX_WINDOW_DAYS } from '@/lib/aeo-outbound/config'

export function failureText(code: string | null, error: string | null, id: string): string {
  switch (code) {
    case 'no_project': return "This Peec project isn't available any more. Pick another."
    case 'own_brand_count': return "In Peec, mark exactly one brand as the client's own brand, then Rerun."
    case 'no_data': return 'Peec has no data for this project in that period. Pick other dates.'
    case 'own_brand_no_row':
    case 'zero_retrievals': return "Peec's report for this period is empty. Pick other dates or check the project in Peec."
    case 'history_too_long': return `Peec took too long on the full history. Pick a start and end date (${MAX_WINDOW_DAYS} days at most) and generate again.`
    case 'timeout': return 'Peec or the copy writer took too long. Rerun.'
    case 'copy_failed':
    case 'copy_outside_sources': return `Writing the copy failed. Rerun. If it fails twice, send engineering this id: ${id}.`
    case 'peec_error': return 'Peec returned an error. Rerun in a few minutes.'
    case 'contract_violation': return `Peec's data changed shape (${error ?? 'unknown field'}). Send engineering this id: ${id}.`
    case 'stale': return 'It stopped before finishing. Rerun.'
    case 'internal': return `Something went wrong on our side. Rerun, or send engineering this id: ${id}.`
    default: return error ?? ''
  }
}
