// The kit sizes its own hand-drawn SVG charts to their card (design/kit.module.css, the `.root svg` rule). A Recharts
// chart inside a kit card must keep Recharts' own sizes: the trend graphs' local look (#498) showed the Recharts legend
// icon, 14 by 14 by its attributes, stretched to 72px by that rule. This runs every `svg` rule in the stylesheet against
// real elements: the kit's own svg still matches, Recharts' surfaces (the chart and its legend icons) never do.
// The selectors are hashed as CSS Modules hashes them (every class outside :global() gets the module's prefix), because
// that is what the browser sees: an unwrapped `.recharts-surface` in this file becomes a module class Recharts never
// carries. The first fix wrote exactly that, and only the local look caught it.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const css = readFileSync('components/report-sections/organic-social/design/kit.module.css', 'utf8')
// Every selector (comma parts) of every rule that sizes an svg, with the module's class names as written in the file.
const svgSelectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter(([, , body]) => /\b(width|height|display)\s*:/.test(body))
  .flatMap(([, sel]) => sel.split(',').map((s) => s.trim()))
  .filter((s) => /(^|\s)svg\b/.test(s))

/** A selector as the browser gets it: local classes prefixed, :global() classes as written. */
const HASH = 'kit-module__h__'
function asBrowserSees(selector: string): string {
  const globals: string[] = []
  const held = selector.replace(/:global\(([^)]*)\)/g, (_m, inner: string) => { globals.push(inner); return `\u0000${globals.length - 1}\u0000` })
  return held.replace(/\.([A-Za-z_][\w-]*)/g, `.${HASH}$1`).replace(/\u0000(\d+)\u0000/g, (_m, i: string) => globals[Number(i)])
}
/** A function's whole argument removed (`keep` false) or put in its place (`keep` true), nested brackets included. */
function unwrap(selector: string, fn: string, keep: boolean): string {
  let out = selector
  for (let i = out.indexOf(`${fn}(`); i !== -1; i = out.indexOf(`${fn}(`)) {
    let depth = 0, j = i + fn.length
    for (; j < out.length; j++) { if (out[j] === '(') depth++; else if (out[j] === ')' && --depth === 0) break }
    out = out.slice(0, i) + (keep ? out.slice(i + fn.length + 1, j) : '') + out.slice(j + 1)
  }
  return out
}
/** Whether a stylesheet selector applies to `el`. jsdom's selector engine (nwsapi 2.2.24) answers false for any
 *  `:where()` holding a pseudo-class, `svg:where(:not(.x))`, where browsers match it (checked in Chrome, 2026-11-24).
 *  `:where(X)` matches exactly what X matches and only drops its specificity, so X is put in its place to ask jsdom.
 *  Specificity is always read from the selector as written (`specificity` below). */
function applies(el: Element, selector: string): boolean {
  try { return el.matches(unwrap(asBrowserSees(selector), ':where', true)) } catch { return false }
}
function inKitCard(svgClass?: string) {
  document.body.innerHTML = `<div class="${HASH}root"><div class="${HASH}card"><svg${svgClass ? ` class="${svgClass}"` : ''}></svg></div></div>`
  return document.querySelector('svg')!
}

test('the stylesheet has a rule sizing svgs under .root, so the checks below are about a real rule', () => {
  expect(svgSelectors.some((s) => s.startsWith('.root '))).toBe(true)
})

test("the kit's own hand-drawn svg is still sized by the kit", () => {
  const own = inKitCard()
  expect(svgSelectors.some((s) => applies(own, s))).toBe(true)
})

test("Recharts' surfaces inside a kit card are never sized by the kit, so its legend icons and chart keep their own size", () => {
  const recharts = inKitCard('recharts-surface')
  expect(svgSelectors.filter((s) => applies(recharts, s))).toEqual([])
})

// Matching is not winning. Paul, #498 review: excluding Recharts with a bare `:not()` raised the `.root svg` rule's
// specificity from (0,1,1) to (0,2,1), so it beat `.donutWrap svg` (which wins today only by coming later in the file)
// and every Social Listening donut stretched to its card's width. The checks above all still passed. These resolve the
// `width` an svg actually gets, as the browser does: the matching rule with the highest specificity, then the last one.

/** Specificity as Selectors 4 counts it: `:where()` adds nothing, `:not()` and `:is()` add their argument's, any other
 *  pseudo-class counts as a class. Enough for this stylesheet's selectors. */
function specificity(selector: string): number[] {
  const s = unwrap(unwrap(unwrap(asBrowserSees(selector), ':where', false), ':not', true), ':is', true)
  return [/#[\w-]+/g, /\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g, /(?:^|[\s>+~])[a-zA-Z][\w-]*/g].map((re) => (s.match(re) ?? []).length)
}
const widthRules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .flatMap(([, sel, body], order) => {
    const width = /(?:^|[\s;])width\s*:\s*([^;]+)/.exec(body)?.[1].trim()
    return width ? sel.split(',').map((s) => ({ selector: s.trim(), width, order })) : []
  })
/** The width the stylesheet gives `el`: the winning rule's, or undefined when no rule sets one. */
function widthOf(el: Element): string | undefined {
  const hits = widthRules.filter((r) => applies(el, r.selector)).map((r) => ({ ...r, spec: specificity(r.selector) }))
  hits.sort((a, b) => a.spec[0] - b.spec[0] || a.spec[1] - b.spec[1] || a.spec[2] - b.spec[2] || a.order - b.order)
  return hits.at(-1)?.width
}

test('specificity counts as the browser does, so the checks below rank rules correctly', () => {
  expect(specificity('.root svg')).toEqual([0, 1, 1])
  expect(specificity('.root svg:not(:global(.recharts-surface))')).toEqual([0, 2, 1])
  expect(specificity('.root svg:where(:not(:global(.recharts-surface)))')).toEqual([0, 1, 1])
  expect(specificity('.donutWrap svg')).toEqual([0, 1, 1])
})

test('a Social Listening donut keeps its 168px: the kit svg rule never outranks .donutWrap svg', () => {
  // brand.tsx and industry.tsx: <Donut> (an svg with no width of its own) in an SlCard whose body is .donutWrap, all
  // inside the tab's .root.
  document.body.innerHTML = `<div class="${HASH}root"><div class="${HASH}card"><div class="${HASH}donutWrap"><svg viewBox="0 0 168 168"></svg></div></div></div>`
  expect(widthOf(document.querySelector('svg')!)).toBe('168px')
})

test("the kit's own hand-drawn chart still fills its card", () => {
  expect(widthOf(inKitCard())).toBe('100%')
})
