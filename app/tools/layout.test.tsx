import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { auth } from '@/auth'
import { EDITOR_MARKER } from '@/components/aeo-outbound/frame-height'

vi.mock('@/components/layout/sidebar', () => ({ Sidebar: () => null }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))
import ToolsLayout from './layout'

afterEach(() => { cleanup(); vi.clearAllMocks() })

// jsdom cannot run :has(), so this pins the classes, built from the editor's own marker name: a rename in editor.tsx
// that the layout does not follow fails here (Paul, #399 review).
test('#396: the layout keeps the 1280px cap and carries, keyed to the editor marker, the classes that drop it, drop the bottom padding and keep the scrollbar room', async () => {
  vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue({ user: { email: 'ana@avenuez.com', role: 'INTERNAL_ANALYST' } })
  const { container } = render(await ToolsLayout({ children: <p>page</p> }))
  const main = container.querySelector('main') as HTMLElement
  const wrap = container.querySelector('main > div') as HTMLElement
  const when = `has-[[${EDITOR_MARKER}]]`
  expect(main.className.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'overflow-y-auto', `${when}:[scrollbar-gutter:stable]`]))
  expect(wrap.className.split(' ')).toEqual(expect.arrayContaining(['mx-auto', 'max-w-7xl', 'px-8', 'py-8', `${when}:max-w-none`, `${when}:pb-0`]))
})
