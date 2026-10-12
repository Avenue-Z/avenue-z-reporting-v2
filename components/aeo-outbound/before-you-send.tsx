'use client'
// The "Before you send" panel (spec v1.1 §4): Fill these in (blocks Approve), Check these (each with a per-session
// Looks right tick), your own checks (ticks, never block) and About this data (collapsed). Every field is named by the
// one label map; clicking an item with a field asks the editor to focus it.
import { fieldLabel } from '@/lib/aeo-outbound/labels'
import { noteGroup, noteText, type StoredNote } from '@/lib/aeo-outbound/notes'
import { ABOUT_DATA, BEFORE_YOU_SEND, CHECK_THESE, FILL_THESE, LOOKS_RIGHT, NOTHING_TO_CHECK, NOTHING_TO_FILL, OWN_CHECKS_TITLE } from './messages'

export interface AboutInfo { projectId: string; projectName: string; projectStatus: string | null; windowLabel: string; models: string[] }
/** From Ryan's skill's QA gate (v1.1 §4). Ticked per session; never stored; never block. */
export const OWN_CHECKS = ['Every claim matches the numbers on the page', 'No mention of the discovery call, pricing or other agencies', 'Findings and hypotheses are kept apart'] as const

/** A Check these item's identity for its Looks right tick: kind, full path and text. */
export const tickKey = (n: StoredNote): string => (typeof n === 'string' ? `legacy|${n}` : `${n.kind}|${n.path ?? ''}|${n.text}`)
const checkItems = (notes: StoredNote[]) => notes.filter((n) => noteGroup(n) === 'check')
/** Open Fill these in items plus Check these items produced by the latest save and not marked Looks right. */
export const openCount = (needsValidation: string[], notes: StoredNote[], ticks: ReadonlySet<string>): number =>
  needsValidation.length + checkItems(notes).filter((n) => !ticks.has(tickKey(n))).length
const statusWords = (s: string) => (s === 'PITCH' ? 'pitch' : s === 'PITCH_ENDED' ? 'pitch ended' : s.toLowerCase().replace(/_/g, ' '))
/** A version 1 row has no project status, so the parenthesis is left out (round-2 MINOR 5). */
export const aboutHeader = (a: AboutInfo): string =>
  `Peec project: ${a.projectName}${a.projectStatus ? ` (${statusWords(a.projectStatus)})` : ''}. Covers ${a.windowLabel}. Models: ${a.models.join(', ') || 'not reported'}.`

export interface BeforeYouSendProps {
  needsValidation: string[]
  notes: StoredNote[]
  titles: readonly [string, string]
  about: AboutInfo | null
  ticks: ReadonlySet<string>
  ownTicks: ReadonlySet<number>
  highlight: string | null
  onTick: (key: string) => void
  onOwnTick: (index: number) => void
  onGoTo: (path: string) => void
}

const itemBtn = 'text-left text-xs text-white underline-offset-2 hover:underline'
export function BeforeYouSend(p: BeforeYouSendProps) {
  const label = (path: string) => fieldLabel(path, p.titles)
  const about = p.notes.filter((n) => noteGroup(n) === 'about' && !(typeof n !== 'string' && n.kind === 'project'))
  const check = checkItems(p.notes)
  return (
    <aside aria-label={BEFORE_YOU_SEND} className="absolute right-0 top-0 z-10 max-h-full w-96 space-y-4 overflow-y-auto rounded-lg border border-white/[0.08] bg-bg-surface p-4 shadow-xl">
      <h2 className="text-sm font-semibold text-white">{BEFORE_YOU_SEND}</h2>
      <section>
        <h3 className="mb-1 text-xs font-semibold text-[#FFFC60]">{FILL_THESE}</h3>
        {p.needsValidation.length ? (
          <ul className="space-y-1">
            {p.needsValidation.map((path) => (
              <li key={path}>
                <button type="button" className={`${itemBtn} ${p.highlight === path ? 'rounded bg-[#FFFC60]/15 px-1' : ''}`} aria-current={p.highlight === path ? 'true' : undefined} onClick={() => p.onGoTo(path)}>
                  {`${label(path)}: Needs validation`}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-text-muted">{NOTHING_TO_FILL}</p>}
      </section>
      <section>
        <h3 className="mb-1 text-xs font-semibold text-white">{CHECK_THESE}</h3>
        {check.length ? (
          <ul className="space-y-2">
            {check.map((n) => {
              const key = tickKey(n)
              const path = typeof n === 'string' ? undefined : n.path
              const text = path ? `${label(path)}: ${noteText(n)}` : noteText(n)
              return (
                <li key={key} className="flex items-start justify-between gap-2">
                  {path ? <button type="button" className={itemBtn} onClick={() => p.onGoTo(path)}>{text}</button> : <span className="text-xs text-white">{text}</span>}
                  <label className="flex shrink-0 items-center gap-1 text-xs text-text-muted">
                    <input type="checkbox" checked={p.ticks.has(key)} onChange={() => p.onTick(key)} />{LOOKS_RIGHT}
                  </label>
                </li>
              )
            })}
          </ul>
        ) : <p className="text-xs text-text-muted">{NOTHING_TO_CHECK}</p>}
      </section>
      <section>
        <h3 className="mb-1 text-xs font-semibold text-white">{OWN_CHECKS_TITLE}</h3>
        <ul className="space-y-1">
          {OWN_CHECKS.map((t, i) => (
            <li key={t}>
              <label className="flex items-center gap-2 text-xs text-white">
                <input type="checkbox" checked={p.ownTicks.has(i)} onChange={() => p.onOwnTick(i)} />{t}
              </label>
            </li>
          ))}
        </ul>
      </section>
      {p.about && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-white">{ABOUT_DATA}</summary>
          <div className="mt-1 space-y-1 text-xs text-text-muted">
            <p>{aboutHeader(p.about)}</p>
            {about.map((n, i) => <p key={i}>{noteText(n)}</p>)}
            <p>{`Project id ${p.about.projectId} (for support).`}</p>
          </div>
        </details>
      )}
    </aside>
  )
}
