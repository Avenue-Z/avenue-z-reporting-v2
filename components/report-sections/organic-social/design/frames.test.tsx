// SlCard's two shapes (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit A, F1). With no analysis
// box it is exactly today's card, which the kit YTD block relies on (parts/ytd-kit.tsx passes no box). With a box, the
// box sits under the card, outside it, and the card and its box are one block in the PDF export.
import { describe, expect, test } from 'vitest'
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { SlCard } from './frames'

const strip = (html: string) => html.replace(/_([A-Za-z][\w-]*)_[0-9a-f]{6}(?![\w-])/g, '$1')
const html = (el: ReactElement) => strip(render(el).container.innerHTML)

describe('SlCard', () => {
  test('without a box, the markup is the card as it was before the box moved out', () => {
    expect(html(<SlCard title="A chart" meta="Some meta" note="A note line.">chart</SlCard>)).toBe(
      '<div class="card" data-export-block=""><div class="cardHead"><h3>A chart</h3><span class="meta">Some meta</span></div>'
      + '<div class="cardBody">chart</div><p class="note">A note line.</p></div>',
    )
  })

  test('without a box or optional parts, only the head and body render', () => {
    expect(html(<SlCard title="A chart">chart</SlCard>)).toBe(
      '<div class="card" data-export-block=""><div class="cardHead"><h3>A chart</h3></div><div class="cardBody">chart</div></div>',
    )
  })

  test('with a box, the box sits under the card and outside it, and the two are one export block', () => {
    const { container } = render(
      <SlCard title="A chart" note="A note line." box={<div data-box="b-x" />}>chart</SlCard>,
    )
    const block = container.firstElementChild as HTMLElement
    expect(block.hasAttribute('data-export-block')).toBe(true)
    const [card, box] = Array.from(block.children) as HTMLElement[]
    expect(block.children).toHaveLength(2)
    expect(card.className).toMatch(/card/)
    // The card is not a block of its own any more: the block is the card and its box together.
    expect(card.hasAttribute('data-export-block')).toBe(false)
    // The note stays in the card; the box is the card's next sibling, never inside it.
    expect(card.querySelector('p')?.textContent).toBe('A note line.')
    expect(card.querySelector('[data-box]')).toBeNull()
    // The box sits in its own cell, so an empty box's button keeps its width in an aligned pair row.
    expect(box.className).toMatch(/box/)
    expect(box.querySelector('[data-box]')?.getAttribute('data-box')).toBe('b-x')
  })

  test('a box of null (a client with no approved text) renders the card alone, as without a box', () => {
    expect(html(<SlCard title="A chart" box={null}>chart</SlCard>)).toBe(html(<SlCard title="A chart">chart</SlCard>))
  })
})

// Unit B (plan 2026-11-24, F2): the "?" hint beside a chart title.
describe('SlCard tooltip', () => {
  test('with text, the title carries the shared hint, which the PDF drops; without, the card is exactly as before', () => {
    const tip = render(<SlCard title="Results over time" tooltip="Made-up definition">x</SlCard>)
    const h3 = tip.container.querySelector('h3')!
    expect(h3.textContent).toBe('Results over time?Made-up definition')
    expect(h3.querySelector('[role="tooltip"]')!.textContent).toBe('Made-up definition')
    expect(h3.querySelector('[data-export-hide]')).not.toBeNull()
    expect(render(<SlCard title="A" tooltip={undefined}>x</SlCard>).container.innerHTML).toBe(render(<SlCard title="A">x</SlCard>).container.innerHTML)
  })
})
