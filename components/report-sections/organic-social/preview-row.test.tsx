// The last look fixes, L5 (spec docs/superpowers/specs/2026-11-26-os-final-look.md): staff's "Preview as client" on every
// Organic Social tab, the same toggle the Social Listening tab has (social-listening/pills.tsx PreviewToggle), right-aligned in
// a row above the tab. A client never gets it; the PDF never shows it.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { auth } from '@/auth'
import { PreviewToggleRow } from './preview-row'
import kit from './design/kit.module.css'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => '/x', useSearchParams: () => new URLSearchParams() }))
afterEach(() => vi.mocked(auth).mockReset())
const as = (role: string | null) => vi.mocked(auth).mockResolvedValue((role ? { user: { role } } : null) as never)
const draw = async (on: boolean) => render(<>{await PreviewToggleRow({ on })}</>).container

describe('PreviewToggleRow', () => {
  test('staff get the toggle, off and on, in a kit row the PDF hides, 28px above the tab', async () => {
    for (const role of ['INTERNAL_ADMIN', 'INTERNAL_ANALYST']) {
      as(role)
      const row = (await draw(false)).firstElementChild as HTMLElement
      expect(row.hasAttribute('data-export-hide')).toBe(true)
      expect(row.className).toBe(`${kit.root} ${kit.topics} mb-7`)
      expect(row.querySelector('button')?.textContent).toBe('Preview as client')
      expect(row.querySelector('button')?.getAttribute('aria-pressed')).toBe('false')
    }
    as('INTERNAL_ADMIN')
    expect((await draw(true)).querySelector('button')?.textContent).toBe('Back to editing')
  })
  test('a client, no session, or a failed session read: nothing', async () => {
    for (const role of ['CLIENT_VIEWER', 'CLIENT_ADMIN', null]) {
      as(role)
      expect((await draw(false)).innerHTML).toBe('')
    }
    vi.mocked(auth).mockRejectedValue(new Error('down'))
    expect((await draw(false)).innerHTML).toBe('')
  })
})
