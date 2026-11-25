// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { buildChecklist } from '@/lib/technical-audit/checklist'
import { PublishChecklist } from './publish-checklist'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const publishSnapshot = vi.fn()
const unpublishSnapshot = vi.fn()
const uploadGscExport = vi.fn()
vi.mock('@/app/actions/tech-audit', () => ({
  publishSnapshot: (...a: unknown[]) => publishSnapshot(...a),
  unpublishSnapshot: (...a: unknown[]) => unpublishSnapshot(...a),
  uploadGscExport: (...a: unknown[]) => uploadGscExport(...a),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const allGsc = (['gsc_indexing', 'gsc_cwv_mobile', 'gsc_cwv_desktop'] as const).map((source) => ({ source, status: 'complete' as const }))
const complete = buildChecklist({ runs: allGsc, commentary: 'approved', status: 'draft' })
const missing = buildChecklist({ runs: [], commentary: 'none', status: 'draft' })
const props = { clientSlug: 'acme', snapshotId: 'snap-1' }

describe('PublishChecklist', () => {
  it('shows Unpublish when published', async () => {
    unpublishSnapshot.mockResolvedValue({ ok: true })
    render(<PublishChecklist {...props} items={complete} status="published" />)
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }))
    await waitFor(() => expect(unpublishSnapshot).toHaveBeenCalledWith({ clientSlug: 'acme', snapshotId: 'snap-1' }))
  })

  it('renders nothing in export mode', () => {
    const { container } = render(<ExportModeProvider><PublishChecklist {...props} items={missing} status="draft" /></ExportModeProvider>)
    expect(container.innerHTML).toBe('')
  })

  it('publishes straight away when nothing is missing', async () => {
    publishSnapshot.mockResolvedValue({ ok: true })
    render(<PublishChecklist {...props} items={complete} status="draft" />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(publishSnapshot).toHaveBeenCalledOnce())
  })

  it('shows the warnings and needs a second click when GSC data is missing', async () => {
    publishSnapshot.mockResolvedValue({ ok: true })
    render(<PublishChecklist {...props} items={missing} status="draft" />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(publishSnapshot).not.toHaveBeenCalled()
    expect(screen.getByText('GSC Page indexing is missing')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }))
    await waitFor(() => expect(publishSnapshot).toHaveBeenCalledOnce())
  })

  it('shows the how-to line and sends an uploaded file to its slot', async () => {
    uploadGscExport.mockResolvedValue({ ok: true })
    render(<PublishChecklist {...props} items={missing} status="draft" />)
    expect(screen.getByText(/All known pages → Export/)).toBeTruthy()
    const input = screen.getByLabelText('Upload GSC Page indexing') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.xlsx')] } })
    await waitFor(() => expect(uploadGscExport).toHaveBeenCalledOnce())
    const form = uploadGscExport.mock.calls[0][0] as FormData
    expect(form.get('slot')).toBe('gsc_indexing')
    expect(form.get('clientSlug')).toBe('acme')
    expect(form.get('snapshotId')).toBe('snap-1')
    expect((form.get('file') as File).name).toBe('a.xlsx')
  })

  it('shows an upload error', async () => {
    uploadGscExport.mockResolvedValue({ ok: false, error: "This isn't a Search Console export the page can read." })
    render(<PublishChecklist {...props} items={missing} status="draft" />)
    fireEvent.change(screen.getByLabelText('Upload GSC Page indexing'), { target: { files: [new File(['x'], 'a.xlsx')] } })
    expect((await screen.findByRole('alert')).textContent).toContain("isn't a Search Console export")
  })
})
