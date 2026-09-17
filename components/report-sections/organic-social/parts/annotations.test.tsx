import { expect, test } from 'vitest'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { ORGANIC_SOCIAL_TEMPLATE, ORGANIC_SOCIAL_PLATFORM_TEMPLATE } from '../template'

test('the annotated graphs are registered as version 2', () => {
  expect(ORGANIC_SOCIAL_PARTS['follower-graph'][2]).toBeDefined()
  expect(ORGANIC_SOCIAL_PARTS['engagement-trend'][2]).toBeDefined()
  expect(ORGANIC_SOCIAL_PARTS['follower-graph'][2].version).toBe(2)
  expect(ORGANIC_SOCIAL_PARTS['engagement-trend'][2].version).toBe(2)
})

test('version 1 of both graphs still exists and is untouched', () => {
  expect(ORGANIC_SOCIAL_PARTS['follower-graph'][1].version).toBe(1)
  expect(ORGANIC_SOCIAL_PARTS['engagement-trend'][1].version).toBe(1)
  expect(ORGANIC_SOCIAL_PARTS['follower-graph'][1].published).toBe(true)
  expect(ORGANIC_SOCIAL_PARTS['engagement-trend'][1].published).toBe(true)
})

// THE RENAISSANCE GUARANTEE. Renaissance pins no graph versions of its own: its
// report_section_config only pins commentary, so its graphs come from these code
// templates. While they say version 1, annotations cannot reach it, whatever the
// registry gains. A client opts in by pinning version 2 in its own config.
test('the code templates still pin version 1, so annotations cannot reach a client that has not opted in', () => {
  const pins = [...ORGANIC_SOCIAL_TEMPLATE.order, ...ORGANIC_SOCIAL_PLATFORM_TEMPLATE.order]
  const graphs = pins.filter((p) => p.id === 'follower-graph' || p.id === 'engagement-trend')
  expect(graphs.length).toBeGreaterThan(0)
  for (const g of graphs) expect(`${g.id}@${g.version}`).toBe(`${g.id}@1`)
})
