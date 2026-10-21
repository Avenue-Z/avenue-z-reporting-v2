import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SETTINGS_DEFAULTS } from '@/lib/aeo-outbound/settings'
import { SettingsForm } from './settings-form'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/app/actions/aeo-outbound-settings', () => ({ saveSettingsAction: save }))

const AT = '2026-10-10T09:00:00.000Z'
const base = { initial: { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'] }, updatedAt: AT, readFailed: false, invalid: false, envAdmins: ['ryan@avenuez.com'], log: [] }
beforeEach(() => { save.mockReset(); push.mockReset() })
afterEach(() => cleanup())

// Clicks Back and says whether the guard stopped it. The guard cancels and stops the click in the capture phase, so a
// bubble listener on document only runs when nothing stopped it; that one cancels the click so jsdom does not navigate.
function backStopped(): boolean {
  let reached = false
  const last = (e: Event) => { reached = true; e.preventDefault() }
  document.addEventListener('click', last)
  fireEvent.click(screen.getByRole('link', { name: 'Back' }))
  document.removeEventListener('click', last)
  return !reached
}

test('the form shows the current settings, the env admins and the note', () => {
  render(<SettingsForm {...base} />)
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.getByText('Changes apply to snapshots generated from now on. Existing drafts and sent links keep their words.')).toBeInTheDocument()
  expect(screen.getByLabelText('Who can use the tool')).toHaveValue('ana@avenuez.com')
  expect(screen.getByText('Always admins: ryan@avenuez.com.')).toBeInTheDocument()
  expect(screen.getByLabelText('Sources section title')).toHaveValue('Cited Sources')
  expect(screen.getByLabelText('The same sentence on every report')).toBeChecked()
  expect(screen.getByLabelText('Next-step sentence')).toHaveValue('A comprehensive AEO audit can validate these patterns across prompt demand, citations, source influence, owned content, earned media, and technical readiness.')
  expect(screen.getByLabelText('Every brand tracked in Peec')).toBeChecked()
  expect(screen.getByLabelText('Most opportunities from Peec recommendations')).toHaveValue('1')
  expect(screen.getByLabelText('Methodology names the prompt count and the AI models')).toBeChecked()
  expect(screen.getByLabelText('Top-left name')).toHaveValue('Avenue Z')
  expect(screen.getByLabelText('Top-left name')).toHaveAttribute('maxlength', '60')
  expect(screen.getByLabelText('Report name')).toHaveValue('AI Visibility Snapshot')
  expect(screen.getByLabelText('Report name')).toHaveAttribute('maxlength', '60')
  expect(screen.getByText('No changes yet.')).toBeInTheDocument()
})

test('Save sends the form and the loaded time, then says Saved and carries the new time into the next save', async () => {
  save.mockResolvedValueOnce({ ok: true, updatedAt: '2026-10-11T12:00:00.000Z' }).mockResolvedValueOnce({ ok: true, updatedAt: '2026-10-11T12:05:00.000Z' })
  render(<SettingsForm {...base} />)
  fireEvent.change(screen.getByLabelText('Sources section title'), { target: { value: 'Strengths' } })
  fireEvent.click(screen.getByLabelText('The same sentence on every report'))
  fireEvent.change(screen.getByLabelText('Next-step sentence'), { target: { value: 'Book a working session.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText('Saved')).toBeInTheDocument()
  expect(save.mock.calls[0]).toEqual([expect.objectContaining({ section1: 'Strengths', nextStepMode: 'fixed', nextStep: 'Book a working session.', users: 'ana@avenuez.com' }), AT])
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1][1]).toBe('2026-10-11T12:00:00.000Z')
})

test('field errors show next to their fields; a conflict offers Reload', async () => {
  save.mockResolvedValueOnce({ ok: false, error: 'invalid', fieldErrors: { users: 'Each email must end in @avenuez.com.' } })
  render(<SettingsForm {...base} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText('Each email must end in @avenuez.com.')).toBeInTheDocument()
  save.mockResolvedValueOnce({ ok: false, error: 'Someone else changed these settings. Reload to see their changes.' })
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText('Someone else changed these settings. Reload to see their changes.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
})

test('a failed read disables Save and says why; an unreadable stored row says the defaults are shown', () => {
  render(<SettingsForm {...base} readFailed />)
  expect(screen.getByText("The settings couldn't be loaded, so they can't be saved now. Reload and try again.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  cleanup()
  render(<SettingsForm {...base} invalid />)
  expect(screen.getByText("The saved settings couldn't be read, so the defaults are shown. Saving replaces them.")).toBeInTheDocument()
})

test('recent changes list who changed which field and when', () => {
  render(<SettingsForm {...base} log={[{ changedAt: '2026-10-02T15:00:00.000Z', changedBy: 'boss@avenuez.com', field: 'sectionTitles' }]} />)
  expect(screen.getByText('Oct 2, 2026, 11:00 AM: boss@avenuez.com changed Section titles')).toBeInTheDocument()
})

test('both names are text inputs that Save sends, and their errors show next to them', async () => {
  save.mockResolvedValueOnce({ ok: false, error: 'invalid', fieldErrors: { series: 'Use 1 to 60 characters.', sidebarWordmark: 'Use a period or comma instead of a long dash.' } })
  render(<SettingsForm {...base} />)
  fireEvent.change(screen.getByLabelText('Top-left name'), { target: { value: 'AEO Lens' } })
  fireEvent.change(screen.getByLabelText('Report name'), { target: { value: 'AEO Lens Report' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText('Use 1 to 60 characters.')).toBeInTheDocument()
  expect(screen.getByText('Use a period or comma instead of a long dash.')).toBeInTheDocument()
  expect(save.mock.calls[0][0]).toEqual(expect.objectContaining({ sidebarWordmark: 'AEO Lens', series: 'AEO Lens Report' }))
})

test('the bar has Back to New Business and Save settings, and the four cards come in order', () => {
  render(<SettingsForm {...base} />)
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/tools/new-business')
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeInTheDocument()
  const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
  expect(names).toEqual(['Report words', 'Report content', 'Who can use it', 'Recent changes'])
  expect(screen.getByLabelText('Next-step sentence')).toHaveAttribute('rows', '4')
})

test('with an unsaved change Back asks; Stay keeps the page and Leave pushes', () => {
  render(<SettingsForm {...base} />)
  fireEvent.change(screen.getByLabelText('Sources section title'), { target: { value: 'Strengths' } })
  expect(backStopped()).toBe(true)
  expect(screen.getByRole('dialog')).toHaveTextContent('You have unsaved edits. Leave anyway?')
  fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('link', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
  expect(push).toHaveBeenCalledWith('/tools/new-business')
})

test('an unchanged form, or a change put back, does not stop Back', () => {
  render(<SettingsForm {...base} />)
  expect(backStopped()).toBe(false)
  fireEvent.change(screen.getByLabelText('Sources section title'), { target: { value: 'Strengths' } })
  fireEvent.change(screen.getByLabelText('Sources section title'), { target: { value: 'Cited Sources' } })
  expect(backStopped()).toBe(false)
})

test('after a save Back is not stopped, and a further edit makes it ask again', async () => {
  save.mockResolvedValueOnce({ ok: true, updatedAt: '2026-10-11T12:00:00.000Z' })
  render(<SettingsForm {...base} />)
  fireEvent.change(screen.getByLabelText('Sources section title'), { target: { value: 'Strengths' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  // Waiting for "Saved" is not enough: the save resolves outside act, so React can show it a task before the effect that
  // drops the guard's click listener runs (CI run 38607387769). Awaiting the save inside act runs that effect too.
  await act(() => save.mock.results[0].value)
  expect(screen.getByText('Saved')).toBeInTheDocument()
  expect(backStopped()).toBe(false)
  fireEvent.change(screen.getByLabelText('Sources section title'), { target: { value: 'Strengths 2' } })
  expect(backStopped()).toBe(true)
})

test('a failed save leaves the form unsaved', async () => {
  save.mockResolvedValueOnce({ ok: false, error: 'invalid', fieldErrors: {} })
  render(<SettingsForm {...base} />)
  fireEvent.change(screen.getByLabelText('Sources section title'), { target: { value: 'Strengths' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(save).toHaveBeenCalled())
  expect(backStopped()).toBe(true)
})

test('beforeunload is registered only while the form is unsaved', () => {
  const add = vi.spyOn(window, 'addEventListener')
  const count = () => add.mock.calls.filter(([t]) => t === 'beforeunload').length
  render(<SettingsForm {...base} />)
  expect(count()).toBe(0)
  fireEvent.change(screen.getByLabelText('Sources section title'), { target: { value: 'Strengths' } })
  expect(count()).toBe(1)
  const e = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(e)
  expect(e.defaultPrevented).toBe(true)
  add.mockRestore()
})
