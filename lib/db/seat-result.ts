/** Pure: turn the atomic-insert outcome into a typed result. No DB import. */
export function interpretAddResult(r: { insertedRows: number; duplicate: boolean }):
  { ok: boolean; reason?: 'seat_limit' | 'duplicate' } {
  if (r.insertedRows > 0) return { ok: true }
  if (r.duplicate) return { ok: false, reason: 'duplicate' }
  return { ok: false, reason: 'seat_limit' }
}
