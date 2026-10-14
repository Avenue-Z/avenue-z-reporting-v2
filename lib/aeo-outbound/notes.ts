// Structured notes (spec v1.1 §4). Rows from before v1.1 store plain strings; the editor shows those under "Check these".
// A row's notes column holds the data notes followed by the grounding flags of its latest save: (string | Note)[].
export const NOTE_KINDS = [
  'needs_validation',
  'number_not_in_data', 'domain_not_in_data', 'long_dash', 'kpi_changed', 'brand_changed', 'date_not_in_window',
  'high_visibility', 'missing_metric', 'no_competitors', 'no_data_brands',
  // Spec v1.1 §19.3: a number in a field Glean wrote, and a "Peec recommends" line Peec's actions don't back.
  'unchecked_number', 'peec_recommends',
  'rank_basis', 'requested_range', 'project', 'peec_warning', 'own_domains', 'empty_source_mix', 'no_profile',
] as const
export type NoteKind = (typeof NOTE_KINDS)[number]
/** path is the full slot path when the note is about one field (for example competitive_bullets.0.lead). */
export interface Note { kind: NoteKind; path?: string; text: string }
export type StoredNote = string | Note
export type NoteGroup = 'fill' | 'check' | 'about'

// Spec v1.1 §19.3: requested_range is a Check these item, so a picked range Peec narrowed is seen before sending.
const ABOUT: ReadonlySet<NoteKind> = new Set<NoteKind>(['rank_basis', 'project', 'peec_warning', 'own_domains', 'empty_source_mix', 'no_profile'])

export const noteGroup = (n: StoredNote): NoteGroup =>
  typeof n === 'string' ? 'check' : n.kind === 'needs_validation' ? 'fill' : ABOUT.has(n.kind) ? 'about' : 'check'
export const noteText = (n: StoredNote): string => (typeof n === 'string' ? n : n.text)

export function isNote(v: unknown): v is Note {
  if (!v || typeof v !== 'object') return false
  const n = v as Record<string, unknown>
  return (NOTE_KINDS as readonly unknown[]).includes(n.kind) && typeof n.text === 'string' && (n.path === undefined || typeof n.path === 'string')
}
export const isStoredNotes = (v: unknown): v is StoredNote[] => Array.isArray(v) && v.every((n) => typeof n === 'string' || isNote(n))
