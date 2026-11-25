// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { ViewIssue } from '@/lib/technical-audit/view'
import { IssueList } from './issue-list'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const setIssueOverride = vi.fn()
vi.mock('@/app/actions/tech-audit', () => ({ setIssueOverride: (...a: unknown[]) => setIssueOverride(...a) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const issue = (key: string, over: Partial<ViewIssue> = {}): ViewIssue => ({
  key, name: key, severity: 'high', urls: 10, sources: ['sf'], detail: [{ source: 'sf', nativeName: key, urlCount: 10 }],
  needsMapping: false, hidden: false, note: null, ...over,
})
const issues = [
  issue('Hidden one', { hidden: true }),
  issue('Broken links', { severity: 'high', sources: ['ahrefs', 'sf'] }),
  issue('Thin content', { severity: 'low', needsMapping: true }),
]

describe('IssueList', () => {
  it('team view shows the hidden count and Unhide, and Hide on visible rows', async () => {
    setIssueOverride.mockResolvedValue({ ok: true })
    render(<IssueList clientSlug="acme" issues={issues} viewer="team" />)
    expect(screen.getByText('Hidden by strategist (1)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unhide' }))
    await waitFor(() => expect(setIssueOverride).toHaveBeenCalledWith({ clientSlug: 'acme', issueKey: 'Hidden one', hidden: false }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.getAllByRole('button', { name: 'Hide' })).toHaveLength(2)
    expect(screen.getByText('Needs mapping')).toBeTruthy()
  })

  it('numbers visible rows 1..n and uses the exact headers', () => {
    render(<IssueList clientSlug="acme" issues={issues} viewer="team" />)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['#', 'Issue', 'Severity', 'URLs affected', 'Sources'])
    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2'])
  })

  it('client view has no controls, hidden section or Needs mapping tag', () => {
    render(<IssueList clientSlug="acme" issues={issues.filter((i) => !i.hidden)} viewer="client" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/Hidden by strategist/)).toBeNull()
    expect(screen.queryByText('Needs mapping')).toBeNull()
  })

  it('export mode renders no controls and no hidden rows even for a team viewer', () => {
    render(<ExportModeProvider><IssueList clientSlug="acme" issues={issues} viewer="team" /></ExportModeProvider>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/Hidden by strategist/)).toBeNull()
    expect(screen.queryByText('Hidden one')).toBeNull()
  })

  it('a note with <b>tags</b> renders literally', () => {
    const { container } = render(<IssueList clientSlug="acme" issues={[issue('A', { note: 'see <b>tags</b>' })]} viewer="client" />)
    expect(screen.getByText('see <b>tags</b>')).toBeTruthy()
    expect(container.querySelector('b')).toBeNull()
  })

  it('severity filter narrows rows', () => {
    render(<IssueList clientSlug="acme" issues={issues} viewer="client" />)
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'low' } })
    expect(screen.queryByText('Broken links')).toBeNull()
    expect(screen.getByText('Thin content')).toBeTruthy()
  })

  it('source filter narrows rows', () => {
    render(<IssueList clientSlug="acme" issues={issues} viewer="client" />)
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'ahrefs' } })
    expect(screen.getByText('Broken links')).toBeTruthy()
    expect(screen.queryByText('Thin content')).toBeNull()
  })

  it('saves a note and shows a server error inline', async () => {
    setIssueOverride.mockResolvedValue({ ok: false, error: 'nope' })
    render(<IssueList clientSlug="acme" issues={[issue('A')]} viewer="team" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
    await waitFor(() => expect(setIssueOverride).toHaveBeenCalledWith({ clientSlug: 'acme', issueKey: 'A', note: 'hi' }))
    expect((await screen.findByRole('alert')).textContent).toBe('nope')
    expect(refresh).not.toHaveBeenCalled()
  })
})
