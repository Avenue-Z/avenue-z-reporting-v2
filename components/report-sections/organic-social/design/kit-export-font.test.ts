// The PDF export draws arrows (↑ ↓ ↗) and emoji with the Noto fonts in its own font stack (app/export/export-theme.css,
// --font-sans), because Nunito Sans has none and the server's Chromium has no system font with them: before that stack
// they printed as empty boxes. The kit's `.root` sets its own font-family (kit.module.css), which would replace that
// stack inside every kit block: the change lines on the kit tiles, Social Listening's changes, post captions, and any
// arrow or emoji in Insights and Recommendations (Paul, #506). These resolve the font-family a kit block actually gets
// from the two stylesheets, as the browser does, with the module's classes hashed as CSS Modules hashes them.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const KIT = read('components/report-sections/organic-social/design/kit.module.css')
const EXPORT = read('app/export/export-theme.css')

/** A kit selector as the browser gets it: local classes prefixed, :global() classes as written. */
const HASH = 'kit-module__h__'
function asBrowserSees(selector: string): string {
  const globals: string[] = []
  const held = selector.replace(/:global\(([^)]*)\)/g, (_m, inner: string) => { globals.push(inner); return `\u0000${globals.length - 1}\u0000` })
  return held.replace(/\.([A-Za-z_][\w-]*)/g, `.${HASH}$1`).replace(/\u0000(\d+)\u0000/g, (_m, i: string) => globals[Number(i)])
}
/** Specificity (ids, classes, types). These stylesheets' font-family selectors use classes and types only. */
function specificity(selector: string): number[] {
  return [/#[\w-]+/g, /\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g, /(?:^|[\s>+~])[a-zA-Z][\w-]*/g].map((re) => (selector.match(re) ?? []).length)
}
/** Every top-level rule that sets font-family, its selectors as the browser sees them. A rule inside `@media` or
 *  `@supports` is not read (Paul, #508). On 2026-11-24 none sets font-family: kit.module.css's four `@media` rules set
 *  layout only (`.pgrid` scrolling and grid columns), and export-theme.css's only `@media` is inside a comment. If one
 *  ever sets font-family, read it here too, or this test can pass while that rule decides the font. */
function fontRules(css: string, hashed: boolean) {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].flatMap(([, sel, body]) => {
    const font = /(?:^|[\s;])font-family\s*:\s*([^;]+)/.exec(body)?.[1].trim()
    return font ? sel.split(',').map((s) => ({ selector: hashed ? asBrowserSees(s.trim()) : s.trim(), font })) : []
  })
}
const RULES = [...fontRules(EXPORT, false), ...fontRules(KIT, true)]
const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** The font-family `el` gets, decided by specificity alone: the two stylesheets can load in either order, so a tie
 *  between different values would leave the answer to load order, and that fails here. */
function fontOf(el: Element): string | undefined {
  const hits = RULES.filter((r) => { try { return el.matches(r.selector) } catch { return false } })
    .map((r) => ({ ...r, spec: specificity(r.selector) }))
    .sort((a, b) => cmp(b.spec, a.spec))
  if (hits.length > 1 && cmp(hits[0].spec, hits[1].spec) === 0 && hits[0].font !== hits[1].font) {
    throw new Error(`load order decides: ${hits[0].selector} vs ${hits[1].selector}`)
  }
  return hits[0]?.font
}
function kitBlock(inExport: boolean) {
  const kit = `<div class="${HASH}root"><p>↑ 12% vs prior period</p></div>`
  document.body.innerHTML = inExport ? `<div class="export-theme">${kit}</div>` : kit
  return document.querySelector(`.${HASH}root`)!
}

test("the export's font stack has the Noto fonts the arrows and emoji need", () => {
  const stack = /--font-sans\s*:\s*([^;]+)/.exec(EXPORT)?.[1] ?? ''
  expect(stack).toContain("'Noto Sans Math'")
  expect(stack).toContain("'Noto Color Emoji'")
})

test("in the PDF, a kit block takes the export's font stack, whichever stylesheet loads first", () => {
  expect(fontOf(kitBlock(true))).toBe('var(--font-sans)')
})

test('on a live page, a kit block keeps the kit font stack', () => {
  expect(fontOf(kitBlock(false))).toBe("'Nunito Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif")
})
