// The authors table's controls (plan 2026-11-24, Unit F): the sort writes slsort (posts is left out), and Show / Hide calls
// the action and refreshes, or says why it could not. Made-up names only.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), search: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: nav.refresh }),
  usePathname: () => '/dashboard/c/reports',
  useSearchParams: () => new URLSearchParams(nav.search),
}))
const action = vi.hoisted(() => ({ pickSlItemAction: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/actions/social-listening', () => action)

import { AuthorSortControl, PickToggle } from './authors-controls'
import { forgetPendingUrl } from './pending-url'

beforeEach(() => { forgetPendingUrl(); vi.clearAllMocks(); nav.search = 'section=organic-social&slcols=b-ytd'; action.pickSlItemAction.mockResolvedValue({ ok: true }) })

describe('AuthorSortControl', () => {
  test('posts is pressed by default; choosing reach writes slsort and keeps the other params', () => {
    render(<AuthorSortControl sort="posts" />)
    expect(screen.getByRole('button', { name: 'Posts' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Reach' }))
    expect(nav.replace).toHaveBeenCalledWith('/dashboard/c/reports?section=organic-social&slcols=b-ytd&slsort=reach', { scroll: false })
    expect(screen.getByRole('button', { name: 'Reach' }).getAttribute('aria-pressed')).toBe('true')
  })
  test('choosing posts again takes slsort out of the URL', () => {
    nav.search = 'section=organic-social&slsort=engagement'
    render(<AuthorSortControl sort="engagement" />)
    fireEvent.click(screen.getByRole('button', { name: 'Posts' }))
    expect(nav.replace).toHaveBeenCalledWith('/dashboard/c/reports?section=organic-social', { scroll: false })
  })
})

describe('PickToggle', () => {
  test('Hide asks the action to hide this author for the month, then refreshes', async () => {
    render(<PickToggle clientSlug="a-client" range="custom:2026-10-01,2026-10-31" kind="author" itemKey="id-1" shown name="Author 1" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hide Author 1 for this month' })) })
    expect(action.pickSlItemAction).toHaveBeenCalledWith({ clientSlug: 'a-client', range: 'custom:2026-10-01,2026-10-31', kind: 'author', key: 'id-1', state: 'hidden' })
    expect(nav.refresh).toHaveBeenCalled()
  })
  test('a refused pick shows the reason and does not refresh', async () => {
    action.pickSlItemAction.mockResolvedValueOnce({ ok: false, error: "That card is not in this month's export. Reload to see it." } as never)
    render(<PickToggle clientSlug="a-client" range="r" kind="card" itemKey="Most active site" shown={false} name="Most active site" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show Most active site for this month' })) })
    expect(screen.getByRole('alert').textContent).toBe("That card is not in this month's export. Reload to see it.")
    expect(nav.refresh).not.toHaveBeenCalled()
  })
})
