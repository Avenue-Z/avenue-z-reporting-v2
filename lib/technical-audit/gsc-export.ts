// TODO(Task 6): stub — real parsers replace these bodies; keep the exports.
import type { Device, GscCwvResult, GscIndexingResult, Parsed } from './types'

export const MAX_GSC_BYTES = 2_097_152

const NOT_AVAILABLE = 'GSC Excel parsing is not available yet'

export function detectGscReport(_bytes: Uint8Array): 'page_indexing' | 'cwv_mobile' | 'cwv_desktop' | null {
  return null
}

export function parseGscPageIndexing(_bytes: Uint8Array): Parsed<GscIndexingResult> {
  return { ok: false, reason: NOT_AVAILABLE }
}

export function parseGscCwv(_bytes: Uint8Array, _device: Device): Parsed<GscCwvResult> {
  return { ok: false, reason: NOT_AVAILABLE }
}
