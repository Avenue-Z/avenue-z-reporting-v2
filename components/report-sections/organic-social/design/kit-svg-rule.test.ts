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
function inKitCard(svgClass?: string) {
  document.body.innerHTML = `<div class="${HASH}root"><div class="${HASH}card"><svg${svgClass ? ` class="${svgClass}"` : ''}></svg></div></div>`
  return document.querySelector('svg')!
}

test('the stylesheet has a rule sizing svgs under .root, so the checks below are about a real rule', () => {
  expect(svgSelectors.some((s) => s.startsWith('.root '))).toBe(true)
})

test("the kit's own hand-drawn svg is still sized by the kit", () => {
  const own = inKitCard()
  expect(svgSelectors.some((s) => own.matches(asBrowserSees(s)))).toBe(true)
})

test("Recharts' surfaces inside a kit card are never sized by the kit, so its legend icons and chart keep their own size", () => {
  const recharts = inKitCard('recharts-surface')
  expect(svgSelectors.filter((s) => recharts.matches(asBrowserSees(s)))).toEqual([])
})
