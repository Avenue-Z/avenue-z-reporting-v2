// The rules round 3 adds to the kit stylesheet (plan docs/superpowers/plans/2026-11-24-os-design-round3.md, Tasks 3 and
// 6). Under Vitest a CSS module answers a class name for whatever key is asked, so a test that only finds `kit.tight` on
// an element cannot tell whether the rule exists. This reads the stylesheet itself, as kit-svg-rule.test.ts does.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const css = readFileSync('components/report-sections/organic-social/design/kit.module.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
/** The declarations of the one rule whose whole selector is `selector`, as property to value. */
function rule(selector: string): Record<string, string> {
  const found = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) => sel.trim() === selector)
  expect(found, selector).toHaveLength(1)
  return Object.fromEntries(found[0][2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':')
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
  }))
}

test('.field: the artifact\'s field border and fill, and no size of its own (each field keeps its own)', () => {
  expect(rule('.field')).toEqual({ 'border-radius': '8px', border: '1px solid rgba(255,255,255,0.16)', background: 'var(--subtle)', color: 'var(--fg)' })
})

test('.tight: line height normal, as the artifact, and nothing else', () => {
  expect(rule('.tight')).toEqual({ 'line-height': 'normal' })
})

test('.root itself still sets no line height, so Social Listening and AEO Informed keep theirs', () => {
  expect(rule('.root')).not.toHaveProperty('line-height')
})
