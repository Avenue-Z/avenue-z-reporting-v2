# AEO Outbound editor: use the whole screen. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the report editor (`/tools/new-business/[reportId]`) uses the full width of the screen, and the report frame
fills the height under the toolbar, with nothing else changing (issue #396).

**Architecture:** the editor's root carries `data-aeo-editor`; the shared tools layout drops its 1280px cap and shrinks
its bottom padding only when that marker is inside it (Tailwind `has-[...]`, CSS `:has()`). The frame's height is one
constant CSS rule that reads a `--aeo-toolbar-h` variable, which a layout effect and a `ResizeObserver` write straight
onto the editor's root from the toolbar's measured height. No React state.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Vitest + jsdom 25.

**Spec:** `docs/superpowers/specs/2026-10-14-aeo-outbound-editor-space-design.md` (reviewed twice; round 2 had no
BLOCKER or MAJOR).

## Global Constraints

- Frame and loading box style, exactly: `height: calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)`, `min-height: 320px`.
- Variable: `--aeo-toolbar-h`, value `` `${Math.ceil(toolbar.getBoundingClientRect().height)}px` ``, written with
  `style.setProperty` on the editor's root element. Never from `ResizeObserverEntry.contentRect`.
- Layout wrapper classes, exactly: `mx-auto max-w-7xl px-8 py-8 has-[[data-aeo-editor]]:max-w-none has-[[data-aeo-editor]]:pb-4`.
- Marker: `data-aeo-editor=""` on the editor's root `<div>`, every status. The root must not get a `style` prop.
- No other file's behavior changes. Comments match the surrounding code; no em or en dashes.

## Spec review round 2 MINORs, handled here

1. §8 browser list gains a generating or failed row and a rerun in progress (Task 3).
2. The layout effect's dependencies are `[]`: the root (`editor.tsx:447`) and toolbar (`:448`) render in every status,
   from the component's only `return` (`:446`). Task 1 says so in a comment.
3. The fallback is today's height floored at 320px (the floor is new). Stated in the PR body.
4. The server-render strip is (108 − T)px, 57px at 1920×1080. Stated in the PR body.
5. Test 4 uses the prototype spy (`vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')`, the pattern at
   `components/aeo-outbound/row-menu.test.tsx:57`) with a mutable height, and the observer callback reads no entries.
6. Print citation is `app/globals.css:265-371` (PR body).
7. The before-paint and zoom claims are browser checks (Task 3).

## Review Focus

1. A toolbar that changes height while the page is open (Edit/Done, a locked message, a rerun): the frame follows in
   the same frame, with no scrollbar flash. Task 1 test 4 pins the variable; Task 3 checks the flash in a browser.
2. A browser without `ResizeObserver` (jsdom stands in): today's height, nothing thrown. Task 1 test 5.
3. Every non-editor tools page and the editor route's refusals keep the 1280px cap. Task 2 tests 6 and 7, Task 3.
4. A live report with Opens: the toolbar stays sticky while scrolling to them. Task 3.
5. Fractional zoom: a draft never scrolls by a pixel. Rounding up in Task 1 test 1; Task 3 at 110% and 125%.

---

### Task 1: the frame fills the height under the toolbar

**Files:**
- Create: `components/aeo-outbound/frame-height.ts`, `components/aeo-outbound/frame-height.test.ts`
- Modify: `components/aeo-outbound/editor.tsx` (imports `:5`; refs near `:84`; a layout effect after the message
  listener, `:286`; the root `:447`; the toolbar `:448`; the frame and loading box `:516-517`)
- Test: `components/aeo-outbound/editor.test.tsx`

**Interfaces:**
- Produces: `TOOLBAR_HEIGHT_VAR = '--aeo-toolbar-h'`, `FRAME_HEIGHT: string`, `FRAME_MIN_HEIGHT = 320`,
  `toolbarHeightVar(h: number): string`.

- [ ] **Step 1: failing tests**

`components/aeo-outbound/frame-height.test.ts`:
```ts
import { expect, test } from 'vitest'
import { FRAME_HEIGHT, FRAME_MIN_HEIGHT, toolbarHeightVar } from './frame-height'

test('spec 2026-10-14 editor space §4.2: the frame is the screen under the toolbar, 16px above and below, and the fallback is the old 140px', () => {
  expect(FRAME_HEIGHT).toBe('calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)')
  expect(FRAME_MIN_HEIGHT).toBe(320)
})

test('the toolbar height rounds up to a whole pixel, so a draft never scrolls by a fraction', () => {
  expect(toolbarHeightVar(51)).toBe('51px')
  expect(toolbarHeightVar(50.4)).toBe('51px')
  expect(toolbarHeightVar(0)).toBe('0px')
})
```

`components/aeo-outbound/editor.test.tsx`, appended:
```tsx
// Spec 2026-10-14 editor space (#396): the editor uses the whole screen.
const root = (c: HTMLElement) => c.querySelector('[data-aeo-editor]') as HTMLElement

test('#396: the editor marks its root in every status, so the tools layout drops its width cap only here', async () => {
  for (const over of [{}, { status: 'live' as const, token: 'tok' }, { status: 'revoked' as const }, { status: 'generating' as const }, { status: 'failed' as const }, { unreadable: true }]) {
    const { container } = await setup(over)
    expect(root(container)).not.toBeNull()
    cleanup()
  }
})

test('#396: the frame and the loading box fill the screen under the toolbar, floored at 320px', async () => {
  const { container } = render(<OutboundEditor {...base} />)
  const loading = screen.getByText(LOADING_REPORT)
  expect(loading.style.height).toBe('calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)')
  expect(loading.style.minHeight).toBe('320px')
  await waitFor(() => expect(frameIn(container)).not.toBeNull())
  expect(frameIn(container).style.height).toBe('calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)')
  expect(frameIn(container).style.minHeight).toBe('320px')
})

test('#396: the toolbar height follows the toolbar, measured as its border box, and stops being watched on unmount', async () => {
  let height = 51
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height, width: 0, top: 0, left: 0, bottom: height, right: 0, x: 0, y: 0, toJSON: () => ({}) }))
  const watchers: { cb: () => void; disconnect: ReturnType<typeof vi.fn> }[] = []
  vi.stubGlobal('ResizeObserver', class {
    cb: () => void; disconnect = vi.fn()
    constructor(cb: () => void) { this.cb = cb; watchers.push(this) }
    observe() {}
    unobserve() {}
  })
  const { container, unmount } = await setup()
  expect(root(container).style.getPropertyValue('--aeo-toolbar-h')).toBe('51px')
  height = 75
  act(() => { for (const w of watchers) w.cb() })
  expect(root(container).style.getPropertyValue('--aeo-toolbar-h')).toBe('75px')
  unmount()
  expect(watchers.every((w) => w.disconnect.mock.calls.length === 1)).toBe(true)
})

test('#396: without ResizeObserver nothing is measured, so the frame keeps the old 140px height', async () => {
  expect(typeof ResizeObserver).toBe('undefined')
  const { container } = await setup()
  expect(root(container).style.getPropertyValue('--aeo-toolbar-h')).toBe('')
})
```
`LOADING_REPORT` is added to the test file's `./messages` import if it is not there.

- [ ] **Step 2:** run `npx vitest run components/aeo-outbound/frame-height.test.ts components/aeo-outbound/editor.test.tsx`.
  Expected: the new tests FAIL (module missing; no `[data-aeo-editor]`; old height string).

- [ ] **Step 3: implementation**

`components/aeo-outbound/frame-height.ts`:
```ts
// The report frame's height on the editor page (spec 2026-10-14 editor space §4.2): the screen under the sticky
// toolbar, 16px above and 16px below. The editor writes the toolbar's height as a CSS variable on its root; until it
// does (the server render, or no ResizeObserver), 108px stands in, which is the old fixed calc(100vh - 140px).
export const TOOLBAR_HEIGHT_VAR = '--aeo-toolbar-h'
export const FRAME_HEIGHT = `calc(100vh - var(${TOOLBAR_HEIGHT_VAR}, 108px) - 32px)`
export const FRAME_MIN_HEIGHT = 320
/** The toolbar's border-box height as the variable's value, rounded up so a draft never scrolls by a fraction. */
export const toolbarHeightVar = (h: number): string => `${Math.ceil(h)}px`
```

`components/aeo-outbound/editor.tsx`:
- `:5` imports `useLayoutEffect` beside `useEffect, useRef, useState`; add
  `import { FRAME_HEIGHT, FRAME_MIN_HEIGHT, TOOLBAR_HEIGHT_VAR, toolbarHeightVar } from './frame-height'`.
- Beside `iframeRef` (`:84`): `const rootRef = useRef<HTMLDivElement>(null)` and `const toolbarRef = useRef<HTMLDivElement>(null)`.
- After the message listener effect (ends `:286`):
```tsx
  // Spec 2026-10-14 editor space §4.2: the frame fills the screen under the toolbar, whose height changes (it wraps, the
  // edit banner, a locked message, a rerun's checklist). The height goes straight onto the root as a CSS variable, with
  // no state, so it lands before the next paint. The root has no style prop, so React never overwrites the variable.
  // Runs once: the root and the toolbar render in every status.
  useLayoutEffect(() => {
    const rootEl = rootRef.current
    const bar = toolbarRef.current
    if (!rootEl || !bar || typeof ResizeObserver === 'undefined') return
    const measure = () => rootEl.style.setProperty(TOOLBAR_HEIGHT_VAR, toolbarHeightVar(bar.getBoundingClientRect().height))
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(bar, { box: 'border-box' })
    return () => watch.disconnect()
  }, [])
```
- `:447` `<div>` becomes `<div ref={rootRef} data-aeo-editor="">`.
- `:448` the sticky toolbar `<div` gains `ref={toolbarRef}`.
- `:516-517` both `style={{ height: 'calc(100vh - 140px)' }}` become `style={{ height: FRAME_HEIGHT, minHeight: FRAME_MIN_HEIGHT }}`.

- [ ] **Step 4:** same command. Expected: PASS, and every existing test in both files still passes.
- [ ] **Step 5:** commit the four files by name; push.

### Task 2: the tools layout drops its cap on the editor page only

**Files:**
- Modify: `app/tools/layout.tsx:23`, `vitest.config.ts` (include list, `:88`)
- Create: `app/tools/layout.test.tsx`
- Test: `app/tools/new-business/[reportId]/page.test.tsx`

- [ ] **Step 1: failing tests**

`app/tools/layout.test.tsx`:
```tsx
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
```
`vitest.config.ts`: add `'app/tools/layout.test.tsx',` after `'app/tools/new-business/**/*.test.{ts,tsx}',`.

`app/tools/new-business/[reportId]/page.test.tsx`, appended:
```tsx
test('#396: a refusal or a missing snapshot renders no editor marker, so the page keeps the width cap', async () => {
  m.access.mockResolvedValue({ ok: false, admins: [], reason: 'forbidden' })
  const refused = await page()
  expect(refused.container.querySelector('[data-aeo-editor]')).toBeNull()
  cleanup()
  m.access.mockResolvedValue({ ok: true, settings: {} })
  m.getReport.mockResolvedValue(null)
  const missing = await page()
  expect(missing.container.querySelector('[data-aeo-editor]')).toBeNull()
})
```
(The `ok: true` shape is checked against `lib/aeo-outbound/access.ts` before writing; the test only needs the page to
reach `getReport`.)

- [ ] **Step 2:** run `npx vitest run app/tools/layout.test.tsx "app/tools/new-business/[reportId]/page.test.tsx"`.
  Expected: the layout test FAILS (no `has-` classes); the page test PASSES already (it guards the refusals).
- [ ] **Step 3:** `app/tools/layout.tsx:23`:
```tsx
        {/* Spec 2026-10-14 editor space (#396): the report editor marks its root, and only there the 1280px cap and half
            the bottom padding go, so the report fills the screen. Every other tools page is unchanged. */}
        <div className="mx-auto max-w-7xl px-8 py-8 has-[[data-aeo-editor]]:max-w-none has-[[data-aeo-editor]]:pb-4">{children}</div>
```
- [ ] **Step 4:** same command. Expected: PASS.
- [ ] **Step 5:** commit the four files by name; push.

### Task 3: verify, then the PR

- [ ] `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`, bounded. All green, counts pasted in the PR.
- [ ] After the build, grep `.next/static/css` for `:has([data-aeo-editor])` with `max-width:none` and the bottom
  padding; paste the matching rule.
- [ ] Browser, branch on the dev database (`aeo-outbound-dev` launch config, which refuses any other host), measured with
  the §1 script: a draft and a live report with opens at 1920×1080, 1440×900, 1280×800; sidebar expanded and collapsed;
  panel open and minimized; Edit/Done toggled (no scrollbar flash, charts settle); a locked message; a rerun in progress
  (frame shorter, no page scroll); a generating or failed row (card full width); zoom 110% and 125% (`main` does not
  scroll on a draft); the hub and Settings still 1280 wide; the live report's toolbar sticky while scrolled to Opens.
  Screenshot of the draft at 1920×1080 after (before is in the spec, §1).
- [ ] PR to `dev`, titled `fix(aeo-outbound): the report editor uses the whole screen (#396) → dev`, Paul as reviewer,
  body: what and why, the measurements before and after, the accepted changes (spec §4.1, §4.2, MINORs 3, 4, 6), the
  check output, and the review checklist below.

## For Paul's review

Specific things to check, then anything else you see:

1. **The `:has()` switch in the shared layout** (`app/tools/layout.tsx`). Is gating the width on a marker inside the
   children acceptable for a layout every tools page shares, or would you rather the editor route own its wrapper? Does
   anything else under `/tools` render inside it that this could catch?
2. **The CSS variable written outside React** (`editor.tsx`, the layout effect). It relies on the root never getting a
   `style` prop. Is a comment enough of a guard, or do you want a test that fails if one is added?
3. **`ResizeObserver` and the frame**: one observer, disconnected on unmount, measuring the border box with
   `getBoundingClientRect`. Any loop risk (the frame resizing changes nothing the observer watches, by design)?
4. **Behavior changes we accepted**: the frame now resizes on Edit/Done, a locked message and a rerun, so the Plotly
   charts relayout; the action buttons sit far right at full width; the fallback has a new 320px floor. Any of these a
   problem?
5. **The tests**: the new layout test needed its own `vitest.config.ts` include entry; is that the right place for it?
6. Anything else: correctness, naming, a simpler way, something the spec missed.
