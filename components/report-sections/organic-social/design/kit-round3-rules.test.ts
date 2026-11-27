// The rules round 3 adds to the kit stylesheet (plan docs/superpowers/plans/2026-11-24-os-design-round3.md, Tasks 3 and
// 6). Under Vitest a CSS module answers a class name for whatever key is asked, so a test that only finds `kit.tight` on
// an element cannot tell whether the rule exists. This reads the stylesheet itself, as kit-svg-rule.test.ts does.
import { readFileSync, readdirSync } from 'node:fs'
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

// Where `.tight` goes (Task 6): every kit wrapper Organic Social's own tabs draw, and never Social Listening's or AEO
// Informed's, whose `.root` keeps the app's line height (both were approved as they are).
const read = (p: string) => readFileSync(p, 'utf8')
const OS_KIT_FILES = [
  'components/report-sections/organic-social/parts/trends-kit.tsx',
  'components/report-sections/organic-social/parts/ytd-kit.tsx',
  'components/report-sections/organic-social/parts/posts-kit.tsx',
  'components/report-sections/organic-social/parts/kpi-kit.tsx',
  'components/report-sections/organic-social/parts/kit-tiles.tsx',
  'components/report-sections/commentary/commentary-panel.tsx',
]
test.each(OS_KIT_FILES)('every kit.root in %s carries kit.tight', (file) => {
  const lines = read(file).split('\n').filter((l) => l.includes('kit.root'))
  expect(lines.length).toBeGreaterThan(0)
  for (const l of lines) expect(l, l.trim()).toContain('kit.tight')
})
// Changed 2026-11-26 (my call, the last look fixes): Social Listening takes the artifact's line height too, so it matches the
// artifact it was built from (measured: its Preview as client button 39px vs the artifact's 37, its pills 32 vs 30). Both of
// its kit roots carry it, and so does the preview toggle row the other tabs got. AEO Informed's own blocks still never do.
test('both Social Listening kit roots and the preview toggle row carry .tight', () => {
  const roots = read('components/report-sections/organic-social/social-listening/section.tsx').split('\n').filter((l) => /className=\{`?\$?\{?s\.root/.test(l))
  expect(roots.length).toBe(2)
  for (const l of roots) expect(l, l.trim()).toContain('s.tight')
  expect(read('components/report-sections/organic-social/preview-row.tsx')).toMatch(/\$\{kit\.root\} \$\{kit\.tight\} \$\{kit\.topics\}/)
})
test('AEO Informed never takes .tight', () => {
  const d = 'components/report-sections/organic-social/aeo-informed'
  for (const f of readdirSync(d)) if (/\.tsx?$/.test(f)) expect(read(`${d}/${f}`), `${d}/${f}`).not.toMatch(/\.tight\b/)
})
