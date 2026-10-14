import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { auth } from '@/auth'

vi.mock('@/components/layout/sidebar', () => ({ Sidebar: () => null }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))
import ToolsLayout from './layout'

afterEach(() => { cleanup(); vi.clearAllMocks() })

test('#396: every tools page keeps the 1280px cap; only a page holding the editor drops it and its bottom padding', async () => {
  vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue({ user: { email: 'ana@avenuez.com', role: 'INTERNAL_ANALYST' } })
  const { container } = render(await ToolsLayout({ children: <p>page</p> }))
  const wrap = container.querySelector('main > div') as HTMLElement
  expect(wrap.className.split(' ')).toEqual(expect.arrayContaining([
    'mx-auto', 'max-w-7xl', 'px-8', 'py-8', 'has-[[data-aeo-editor]]:max-w-none', 'has-[[data-aeo-editor]]:pb-4',
  ]))
})
