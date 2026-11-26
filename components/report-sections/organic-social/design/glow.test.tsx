// The last look fixes, L1 (spec docs/superpowers/specs/2026-11-26-os-final-look.md; trial docs/findings/2026-11-26-os-glow-trial.md):
// the artifact's page glow (index.html:39-43) paints the page's `main` while a kit tab's marker is inside it. The marker is
// hidden, aria-hidden and hidden in the PDF; the export page has no `main`, so the glow can't print.
import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GlowMark } from './frames'
import s from './kit.module.css'

describe('the glow', () => {
  test('the marker is one hidden, aria-hidden span the PDF hides, carrying the kit class the rule looks for', () => {
    const c = render(<GlowMark />).container
    const m = c.firstElementChild as HTMLElement
    expect(c.children.length).toBe(1)
    expect(m.tagName).toBe('SPAN')
    expect(m.hidden).toBe(true)
    expect(m.getAttribute('aria-hidden')).toBe('true')
    expect(m.hasAttribute('data-export-hide')).toBe(true)
    expect(m.className).toBe(s.glowMark)
    expect(m.textContent).toBe('')
  })

  test("the rule paints main with the artifact's two gradients over black, fixed to the viewport", () => {
    const css = readFileSync(join(__dirname, 'kit.module.css'), 'utf8').replace(/\s+/g, ' ')
    expect(css).toContain(':global(main):has(.glowMark) { background: radial-gradient(ellipse 60% 40% at 90% 100%, rgba(0,60,60,0.5) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 80% 100%, rgba(30,0,80,0.4) 0%, transparent 60%), #000000; background-attachment: fixed; }')
  })
})
