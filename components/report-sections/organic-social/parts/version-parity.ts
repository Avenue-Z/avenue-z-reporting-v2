// Test-only helper (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 1). Every new kit version of an
// Organic Social part is proven against the version it replaces by rendering both on the same data and comparing what a
// viewer can read: every number, label, change line and tooltip. Markup and class names are free to differ; text is not.
// Imported only by tests.

/** The cards a part draws when it has nothing to show. Two of them compare equal to each other, so a pair of renders
 *  that are only these proves nothing. Matched by prefix for the timeout card, whose copy varies by caller
 *  (`parts/shared.tsx` `Fallback`, `YTD_TIMEOUT_TEXT`); `version-parity.test.tsx` renders the real components to keep
 *  this list in step with them. */
const FALLBACK_EXACT = new Set(["Couldn't load this section.", 'No data for this period.'])
const FALLBACK_PREFIX = 'Taking longer than usual'
const isFallback = (v: string) => FALLBACK_EXACT.has(v) || v.startsWith(FALLBACK_PREFIX)

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Every element in document order: its own text (its direct text nodes joined, whitespace collapsed), then its
 *  `aria-label` and `title`. Own text rather than leaf text, because a tooltip holds its definition beside a child arrow
 *  element and a leaf-only rule never sees it (the parity trial on #490). */
export function visibleValues(container: HTMLElement): string[] {
  const out: string[] = []
  for (const node of container.querySelectorAll('*')) {
    let own = ''
    for (const child of node.childNodes) if (child.nodeType === 3) own += child.textContent ?? ''
    const text = collapse(own)
    if (text) out.push(text)
    const aria = node.getAttribute('aria-label')
    if (aria) out.push(`aria-label=${collapse(aria)}`)
    const title = node.getAttribute('title')
    if (title) out.push(`title=${collapse(title)}`)
  }
  return out
}

/** Throws unless both renders show the same values in the same order. Also throws when either rendered nothing, or only
 *  fallback cards, since two empty or two error renders would otherwise compare equal and prove nothing. */
export function expectSameValues(oldEl: HTMLElement, newEl: HTMLElement): void {
  const before = visibleValues(oldEl)
  const after = visibleValues(newEl)
  for (const [side, list] of [['old', before], ['new', after]] as const) {
    if (list.length === 0) throw new Error(`The ${side} render shows nothing, so there is nothing to compare.`)
    if (list.every(isFallback)) throw new Error(`The ${side} render is only a fallback card (${JSON.stringify(list)}), so it proves nothing.`)
  }
  const len = Math.max(before.length, after.length)
  for (let i = 0; i < len; i++) {
    if (before[i] !== after[i]) {
      throw new Error(
        `Values differ at position ${i}: old ${JSON.stringify(before[i])}, new ${JSON.stringify(after[i])}.\n` +
        `old: ${JSON.stringify(before)}\nnew: ${JSON.stringify(after)}`,
      )
    }
  }
}
