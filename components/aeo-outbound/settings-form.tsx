'use client'
// The Settings page's form (spec v1.1 §8). It sends what the admin typed; the server validates, saves and logs.
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { saveSettingsAction } from '@/app/actions/aeo-outbound-settings'
import { fmtEasternDateTime } from '@/lib/aeo-outbound/metrics'
import { SETTINGS_ERRORS, SETTINGS_FIELD_LABELS, SETTINGS_LIMITS, settingsToInput, type OutboundSettings, type SettingsErrors, type SettingsField, type SettingsInput } from '@/lib/aeo-outbound/settings'
import {
  ACTION_FAILED, ADMINS_HELP, FIRST_SECTION, NEXT_FIXED, NEXT_SENTENCE, NEXT_WRITTEN, NO_CHANGES, RANK_ALL, RANK_COUNT, RANK_TOP,
  RECENT_CHANGES, REPORT_CONTENT, REPORT_CONTENT_NOTE, REPORT_WORDS, REPORT_WORDS_NOTE, WHO_CAN_USE, WHO_CAN_USE_NOTE, LEAVE, LEAVE_UNSAVED, STAY, SAVED, SAVE_SETTINGS, SAVING, SECOND_SECTION, SETTINGS_INVALID, SETTINGS_NOTE, SETTINGS_TITLE, USERS_HELP, alwaysAdmins, changeLine,
} from './messages'
import { ConfirmDialog } from './confirm-dialog'
import { btnCls, cardCls, inputCls, primaryBtnCls } from './ui'
import { useLeaveGuard } from './use-leave-guard'

export type SettingsLogEntry = { changedAt: string; changedBy: string; field: string }
export interface SettingsFormProps { initial: OutboundSettings; updatedAt: string | null; readFailed: boolean; invalid: boolean; envAdmins: string[]; log: SettingsLogEntry[] }

const fieldName = (f: string) => (Object.prototype.hasOwnProperty.call(SETTINGS_FIELD_LABELS, f) ? SETTINGS_FIELD_LABELS[f as SettingsField] : f)

export function SettingsForm(p: SettingsFormProps) {
  const [form, setForm] = useState<SettingsInput>(() => settingsToInput(p.initial))
  // The values last loaded or saved. The server returns only updatedAt and the form is never replaced with normalised
  // values, so the form that was sent is the saved state.
  const [baseline, setBaseline] = useState<SettingsInput>(form)
  const [leave, setLeave] = useState<(() => void) | null>(null)
  const [loadedAt, setLoadedAt] = useState(p.updatedAt)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<SettingsErrors>({})
  const unsaved = JSON.stringify(form) !== JSON.stringify(baseline)
  // With readFailed the guard still asks; that is accepted.
  useLeaveGuard(unsaved, (go) => setLeave(() => go))
  const set = (patch: Partial<SettingsInput>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false) }
  const err = (f: SettingsField) => fieldErrors[f] && <p className="mt-1 text-xs text-[#FF6B6B]">{fieldErrors[f]}</p>

  async function onSave() {
    const sent = form
    setSaving(true); setSaved(false); setError(null); setFieldErrors({})
    try {
      const r = await saveSettingsAction(sent, loadedAt)
      if (r.ok) { setLoadedAt(r.updatedAt); setBaseline(sent); setSaved(true) }
      else if (r.error === 'invalid') setFieldErrors(r.fieldErrors ?? {})
      else setError(r.error === 'unavailable' || r.error === 'forbidden' ? ACTION_FAILED : r.error)
    } catch {
      setError(ACTION_FAILED)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-8 -mt-8 mb-4 border-b border-white/[0.06] bg-black px-8 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/tools/new-business" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden />Back
          </Link>
          <span className="text-sm font-semibold text-white">{SETTINGS_TITLE}</span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {saving && <span className="text-xs text-text-muted">{SAVING}</span>}
            {saved && <span className="text-xs text-[#60FF80]" role="status">{SAVED}</span>}
            {error && (
              <span className="inline-flex items-center gap-2 text-xs text-[#FF6B6B]">
                {error}
                {error === SETTINGS_ERRORS.conflict && <button type="button" className={btnCls} onClick={() => window.location.reload()}>Reload</button>}
              </span>
            )}
            <button type="button" className={primaryBtnCls} disabled={p.readFailed || saving} onClick={() => void onSave()}>{SAVE_SETTINGS}</button>
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{SETTINGS_TITLE}</h1>
          <p className="mt-1 text-sm text-text-muted">{SETTINGS_NOTE}</p>
        </div>
        {p.readFailed && <p className="text-sm text-[#FF6B6B]">{SETTINGS_ERRORS.readFailed}</p>}
        {p.invalid && <p className="text-sm text-[#FFFC60]">{SETTINGS_INVALID}</p>}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <section className={`${cardCls} space-y-4`}>
              <div><h2 className="text-base font-semibold text-white">{REPORT_WORDS}</h2><p className="mt-1 text-xs text-text-muted">{REPORT_WORDS_NOTE}</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="s-wordmark" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.sidebarWordmark}</label>
                  <input id="s-wordmark" className={`${inputCls} w-full`} maxLength={SETTINGS_LIMITS.title} value={form.sidebarWordmark} onChange={(e) => set({ sidebarWordmark: e.target.value })} />
                  {err('sidebarWordmark')}
                </div>
                <div>
                  <label htmlFor="s-series" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.series}</label>
                  <input id="s-series" className={`${inputCls} w-full`} maxLength={SETTINGS_LIMITS.title} value={form.series} onChange={(e) => set({ series: e.target.value })} />
                  {err('series')}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="s-t1" className="block text-xs text-text-muted">{FIRST_SECTION}</label>
                  <input id="s-t1" className={`${inputCls} w-full`} maxLength={SETTINGS_LIMITS.title} value={form.section1} onChange={(e) => set({ section1: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="s-t2" className="block text-xs text-text-muted">{SECOND_SECTION}</label>
                  <input id="s-t2" className={`${inputCls} w-full`} maxLength={SETTINGS_LIMITS.title} value={form.section2} onChange={(e) => set({ section2: e.target.value })} />
                </div>
              </div>
              {err('sectionTitles')}
            </section>
            <section className={`${cardCls} space-y-4`}>
              <div><h2 className="text-base font-semibold text-white">{REPORT_CONTENT}</h2><p className="mt-1 text-xs text-text-muted">{REPORT_CONTENT_NOTE}</p></div>
              <fieldset>
                <legend className="text-xs text-text-muted">{SETTINGS_FIELD_LABELS.fixedNextStep}</legend>
                <label className="mr-4 text-sm text-white"><input type="radio" name="s-next" checked={form.nextStepMode === 'written'} onChange={() => set({ nextStepMode: 'written' })} /> {NEXT_WRITTEN}</label>
                <label className="text-sm text-white"><input type="radio" name="s-next" checked={form.nextStepMode === 'fixed'} onChange={() => set({ nextStepMode: 'fixed' })} /> {NEXT_FIXED}</label>
                <label htmlFor="s-next-text" className="mt-2 block text-xs text-text-muted">{NEXT_SENTENCE}</label>
                <textarea id="s-next-text" rows={4} className={`${inputCls} w-full`} maxLength={SETTINGS_LIMITS.nextStep} disabled={form.nextStepMode !== 'fixed'} value={form.nextStep} onChange={(e) => set({ nextStep: e.target.value })} />
                {err('fixedNextStep')}
              </fieldset>
              <fieldset>
                <legend className="text-xs text-text-muted">{SETTINGS_FIELD_LABELS.rankAmong}</legend>
                <label className="mr-4 text-sm text-white"><input type="radio" name="s-rank" checked={form.rankMode === 'all'} onChange={() => set({ rankMode: 'all' })} /> {RANK_ALL}</label>
                <label className="text-sm text-white"><input type="radio" name="s-rank" checked={form.rankMode === 'top'} onChange={() => set({ rankMode: 'top' })} /> {RANK_TOP}</label>
                <label htmlFor="s-rank-n" className="mt-2 block text-xs text-text-muted">{RANK_COUNT}</label>
                <input id="s-rank-n" type="number" min={SETTINGS_LIMITS.rankMin} max={SETTINGS_LIMITS.rankMax} className={`${inputCls} w-24`} disabled={form.rankMode !== 'top'} value={form.rankAmong} onChange={(e) => set({ rankAmong: e.target.value })} />
                {err('rankAmong')}
              </fieldset>
              <div>
                <label htmlFor="s-rows" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.peecOpportunityRows}</label>
                <select id="s-rows" className={inputCls} value={form.peecOpportunityRows} onChange={(e) => set({ peecOpportunityRows: e.target.value })}>
                  {['0', '1', '2', '3'].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {err('peecOpportunityRows')}
              </div>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={form.methodologyStatesPromptsAndModels} onChange={(e) => set({ methodologyStatesPromptsAndModels: e.target.checked })} />
                {SETTINGS_FIELD_LABELS.methodologyStatesPromptsAndModels}
              </label>
            </section>
          </div>
          <div className="space-y-6">
            <section className={`${cardCls} space-y-4`}>
              <div><h2 className="text-base font-semibold text-white">{WHO_CAN_USE}</h2><p className="mt-1 text-xs text-text-muted">{WHO_CAN_USE_NOTE}</p></div>
              <div>
                <label htmlFor="s-users" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.users}</label>
                <textarea id="s-users" rows={4} className={`${inputCls} w-full`} value={form.users} onChange={(e) => set({ users: e.target.value })} />
                <p className="mt-1 text-xs text-text-muted">{USERS_HELP}</p>{err('users')}
              </div>
              <div>
                <label htmlFor="s-admins" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.admins}</label>
                <textarea id="s-admins" rows={3} className={`${inputCls} w-full`} value={form.admins} onChange={(e) => set({ admins: e.target.value })} />
                <p className="mt-1 text-xs text-text-muted">{ADMINS_HELP}</p>
                {p.envAdmins.length > 0 && <p className="text-xs text-text-muted">{alwaysAdmins(p.envAdmins)}</p>}
                {err('admins')}
              </div>
            </section>
            <section className={cardCls}>
              <h2 className="mb-2 text-sm font-semibold text-white">{RECENT_CHANGES}</h2>
              {p.log.length === 0 ? <p className="text-xs text-text-muted">{NO_CHANGES}</p> : (
                <ul className="space-y-1 text-xs text-text-muted">
                  {p.log.map((l, i) => <li key={i}>{changeLine(fmtEasternDateTime(new Date(l.changedAt)), l.changedBy, fieldName(l.field))}</li>)}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
      {leave && <ConfirmDialog title={LEAVE_UNSAVED} confirmLabel={LEAVE} cancelLabel={STAY} onCancel={() => setLeave(null)} onConfirm={() => { const go = leave; setLeave(null); go() }} />}
    </div>
  )
}
