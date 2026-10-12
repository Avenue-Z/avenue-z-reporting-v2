'use client'
// The Settings page's form (spec v1.1 §8). It sends what the admin typed; the server validates, saves and logs.
import { useState } from 'react'
import { saveSettingsAction } from '@/app/actions/aeo-outbound-settings'
import { fmtEasternDateTime } from '@/lib/aeo-outbound/metrics'
import { SETTINGS_ERRORS, SETTINGS_FIELD_LABELS, SETTINGS_LIMITS, settingsToInput, type OutboundSettings, type SettingsErrors, type SettingsField, type SettingsInput } from '@/lib/aeo-outbound/settings'
import {
  ACTION_FAILED, ADMINS_HELP, FIRST_SECTION, NEXT_FIXED, NEXT_SENTENCE, NEXT_WRITTEN, NO_CHANGES, RANK_ALL, RANK_COUNT, RANK_TOP,
  RECENT_CHANGES, SAVED, SAVE_SETTINGS, SAVING, SECOND_SECTION, SETTINGS_INVALID, SETTINGS_NOTE, SETTINGS_TITLE, USERS_HELP, alwaysAdmins, changeLine,
} from './messages'
import { btnCls, cardCls, inputCls, primaryBtnCls } from './ui'

export type SettingsLogEntry = { changedAt: string; changedBy: string; field: string }
export interface SettingsFormProps { initial: OutboundSettings; updatedAt: string | null; readFailed: boolean; invalid: boolean; envAdmins: string[]; log: SettingsLogEntry[] }

const fieldName = (f: string) => (Object.prototype.hasOwnProperty.call(SETTINGS_FIELD_LABELS, f) ? SETTINGS_FIELD_LABELS[f as SettingsField] : f)

export function SettingsForm(p: SettingsFormProps) {
  const [form, setForm] = useState<SettingsInput>(() => settingsToInput(p.initial))
  const [loadedAt, setLoadedAt] = useState(p.updatedAt)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<SettingsErrors>({})
  const set = (patch: Partial<SettingsInput>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false) }
  const err = (f: SettingsField) => fieldErrors[f] && <p className="mt-1 text-xs text-[#FF6B6B]">{fieldErrors[f]}</p>

  async function onSave() {
    setSaving(true); setSaved(false); setError(null); setFieldErrors({})
    try {
      const r = await saveSettingsAction(form, loadedAt)
      if (r.ok) { setLoadedAt(r.updatedAt); setSaved(true) }
      else if (r.error === 'invalid') setFieldErrors(r.fieldErrors ?? {})
      else setError(r.error === 'unavailable' || r.error === 'forbidden' ? ACTION_FAILED : r.error)
    } catch {
      setError(ACTION_FAILED)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{SETTINGS_TITLE}</h1>
        <p className="mt-1 text-sm text-text-muted">{SETTINGS_NOTE}</p>
      </div>
      {p.readFailed && <p className="text-sm text-[#FF6B6B]">{SETTINGS_ERRORS.readFailed}</p>}
      {p.invalid && <p className="text-sm text-[#FFFC60]">{SETTINGS_INVALID}</p>}
      <section className={`${cardCls} space-y-4`}>
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
        <fieldset>
          <legend className="text-xs text-text-muted">{SETTINGS_FIELD_LABELS.fixedNextStep}</legend>
          <label className="mr-4 text-sm text-white"><input type="radio" name="s-next" checked={form.nextStepMode === 'written'} onChange={() => set({ nextStepMode: 'written' })} /> {NEXT_WRITTEN}</label>
          <label className="text-sm text-white"><input type="radio" name="s-next" checked={form.nextStepMode === 'fixed'} onChange={() => set({ nextStepMode: 'fixed' })} /> {NEXT_FIXED}</label>
          <label htmlFor="s-next-text" className="mt-2 block text-xs text-text-muted">{NEXT_SENTENCE}</label>
          <textarea id="s-next-text" rows={2} className={`${inputCls} w-full`} maxLength={SETTINGS_LIMITS.nextStep} disabled={form.nextStepMode !== 'fixed'} value={form.nextStep} onChange={(e) => set({ nextStep: e.target.value })} />
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
        <div>
          <label htmlFor="s-wordmark" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.sidebarWordmark}</label>
          <select id="s-wordmark" className={inputCls} value={form.sidebarWordmark} onChange={(e) => set({ sidebarWordmark: e.target.value })}>
            <option value="AIVx">AIVx</option>
            <option value="Avenue Z">Avenue Z</option>
          </select>
          {err('sidebarWordmark')}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className={primaryBtnCls} disabled={p.readFailed || saving} onClick={() => void onSave()}>{SAVE_SETTINGS}</button>
          {saving && <span className="text-xs text-text-muted">{SAVING}</span>}
          {saved && <span className="text-xs text-[#60FF80]" role="status">{SAVED}</span>}
          {error && (
            <span className="inline-flex items-center gap-2 text-xs text-[#FF6B6B]">
              {error}
              {error === SETTINGS_ERRORS.conflict && <button type="button" className={btnCls} onClick={() => window.location.reload()}>Reload</button>}
            </span>
          )}
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
  )
}
