// The staff-only "Before you publish" checklist: what is still missing for one month's Technical Audit snapshot.
import type { TaRunStatus, TaSource } from './types'

export interface ChecklistItem {
  key: TaSource | 'review' | 'commentary'
  label: string
  state: 'done' | 'todo' | 'problem'
  detail?: string
}

export type GscSlot = 'gsc_indexing' | 'gsc_cwv_mobile' | 'gsc_cwv_desktop'

export const GSC_SLOTS: readonly GscSlot[] = ['gsc_indexing', 'gsc_cwv_mobile', 'gsc_cwv_desktop']

const LABELS: Record<TaSource, string> = {
  sf: 'Screaming Frog',
  ahrefs: 'Ahrefs',
  gsc_indexing: 'Upload GSC Page indexing',
  gsc_cwv_mobile: 'Upload GSC Core Web Vitals — mobile',
  gsc_cwv_desktop: 'Upload GSC Core Web Vitals — desktop',
}

const HOW_TO: Record<GscSlot, string> = {
  gsc_indexing: 'Search Console → Indexing → Pages → All known pages → Export → Download Excel; upload the .xlsx',
  gsc_cwv_mobile: 'Search Console → Experience → Core Web Vitals → Mobile → Open report → Export → Download Excel; upload the .xlsx',
  gsc_cwv_desktop: 'Search Console → Experience → Core Web Vitals → Desktop → Open report → Export → Download Excel; upload the .xlsx',
}

export const isGscSlot = (k: ChecklistItem['key']): k is GscSlot => (GSC_SLOTS as readonly string[]).includes(k)

export interface ChecklistInput {
  runs: { source: TaSource; status: TaRunStatus; lastError?: string | null }[]
  commentary: 'none' | 'draft' | 'approved'
  status: 'draft' | 'published'
  /** False when the brand has not opted into commentary for this view: the Commentary item is left out. */
  commentaryEnabled?: boolean
}

export function buildChecklist({ runs, commentary, status, commentaryEnabled = true }: ChecklistInput): ChecklistItem[] {
  const sources: TaSource[] = ['sf', 'ahrefs', ...GSC_SLOTS]
  const items: ChecklistItem[] = sources.map((key) => {
    const run = runs.find((r) => r.source === key)
    const label = LABELS[key]
    if (run?.status === 'complete') return { key, label, state: 'done' }
    if (run?.status === 'failed') {
      return { key, label, state: 'problem', detail: run.lastError || 'The last run failed.' }
    }
    if (run?.status === 'missing' && run.lastError && !isGscSlot(key)) return { key, label, state: 'todo', detail: run.lastError }
    return isGscSlot(key) ? { key, label, state: 'todo', detail: HOW_TO[key] } : { key, label, state: 'todo' }
  })
  items.push({
    key: 'review',
    label: 'Review the issues list',
    state: status === 'published' ? 'done' : 'todo',
  })
  if (!commentaryEnabled) return items
  items.push(
    commentary === 'approved'
      ? { key: 'commentary', label: 'Commentary', state: 'done' }
      : { key: 'commentary', label: 'Commentary', state: 'todo', detail: commentary === 'draft' ? 'Draft, not approved yet' : undefined },
  )
  return items
}

/** One line per GSC slot that has no data: shown before publishing so a half-empty page is a deliberate choice. */
export function publishWarnings(items: ChecklistItem[]): string[] {
  return items
    .filter((i) => isGscSlot(i.key) && i.state !== 'done')
    .map((i) => `${i.label.replace(/^Upload /, '')} is missing`)
}
