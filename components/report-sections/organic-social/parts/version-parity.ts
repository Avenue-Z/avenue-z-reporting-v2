// Test-only helper (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 1). Every new kit version of an
// Organic Social part is proven against the version it replaces by rendering both on the same data and comparing what a
// viewer can read: every number, label, change line and tooltip. Markup and class names are free to differ; text is not.
// Imported only by tests.

/** The card a part draws when it has nothing to show: the error card (`parts/shared.tsx:14`, `Fallback`), the empty card
 *  (`no-data.tsx:8`, `NoData`, with any message) and AEO's empty table (`aeo-informed/aeo-table.tsx:110`) all carry exactly
 *  these classes. Recognised by the card, never by its wording, so a message nobody has written yet is caught too (Paul,
 *  #494, issue #495). `version-parity.test.tsx` renders each real card, so a restyle that stopped one matching fails there. */
const FALLBACK_CARD = 'rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted'.split(' ').sort().join(' ')
const isFallbackCard = (el: Element) => [...el.classList].sort().join(' ') === FALLBACK_CARD

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

type Entry = { value: string; inFallback: boolean }

/** Every element in document order: its own text (its direct text nodes joined, whitespace collapsed), then its
 *  `aria-label` and `title`, each marked with whether it sits inside a fallback card. */
function entries(container: HTMLElement): Entry[] {
  const all = [...container.querySelectorAll('*')]
  const cards = all.filter(isFallbackCard)
  const out: Entry[] = []
  for (const node of all) {
    const inFallback = cards.some((card) => card.contains(node))
    let own = ''
    for (const child of node.childNodes) if (child.nodeType === 3) own += child.textContent ?? ''
    const text = collapse(own)
    if (text) out.push({ value: text, inFallback })
    const aria = node.getAttribute('aria-label')
    if (aria) out.push({ value: `aria-label=${collapse(aria)}`, inFallback })
    const title = node.getAttribute('title')
    if (title) out.push({ value: `title=${collapse(title)}`, inFallback })
  }
  return out
}

/** What a viewer can read, in document order: every element's own text (not leaf text, because a tooltip holds its
 *  definition beside a child arrow element and a leaf-only rule never sees it, the parity trial on #490), then its
 *  `aria-label` and `title`. */
export function visibleValues(container: HTMLElement): string[] {
  return entries(container).map((e) => e.value)
}

/** Throws unless both renders show the same values in the same order. It also throws when either side rendered
 *  nothing or only fallback cards, and, unless the test passes `{ allowFallback: true }`, when either side shows any
 *  fallback card at all: a getter the test forgot to feed draws one, and two such renders compare equal on everything
 *  around it (the AEO error is its controls, then the card, `aeo-informed/section.tsx:74`). The opt-in is for a test
 *  that draws a fallback on purpose, such as one error card among real tiles. */
export function expectSameValues(oldEl: HTMLElement, newEl: HTMLElement, opts: { allowFallback?: boolean } = {}): void {
  const sides = [['old', entries(oldEl)], ['new', entries(newEl)]] as const
  for (const [side, list] of sides) {
    if (list.length === 0) throw new Error(`The ${side} render shows nothing, so there is nothing to compare.`)
    const cards = list.filter((e) => e.inFallback).map((e) => e.value)
    if (cards.length === list.length) throw new Error(`The ${side} render is only a fallback card (${JSON.stringify(cards)}), so it proves nothing.`)
    if (cards.length > 0 && !opts.allowFallback) {
      throw new Error(`The ${side} render shows a fallback card (${JSON.stringify(cards)}), usually a getter the test did not feed. Pass { allowFallback: true } only if the card is deliberate.`)
    }
  }
  const before = sides[0][1].map((e) => e.value)
  const after = sides[1][1].map((e) => e.value)
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
