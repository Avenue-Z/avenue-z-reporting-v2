// The value-equality helper every new part version is proven with (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md,
// Task 1). These tests pin what it compares and, as importantly, what it refuses to call equal.
import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expectSameValues, visibleValues } from './version-parity'
import { Fallback, YTD_TIMEOUT_TEXT } from './shared'
import { NoData } from '../no-data'

const el = (node: ReactNode) => render(<>{node}</>).container

describe('visibleValues', () => {
  test('reads each element\'s own text, in document order, whitespace collapsed', () => {
    expect(visibleValues(el(<div><p>Total   Followers</p><p>1,500</p><p>↑ 25% vs prior period</p></div>)))
      .toEqual(['Total Followers', '1,500', '↑ 25% vs prior period'])
  })
  test('keeps text that sits beside a child element, as a tooltip does beside its arrow (the trial on #490 missed these)', () => {
    expect(visibleValues(el(<span role="tooltip">The total number of followers.<span className="arrow" /></span>)))
      .toEqual(['The total number of followers.'])
  })
  test('counts aria-label and title', () => {
    expect(visibleValues(el(<svg aria-label="Followers over time"><rect><title>12 on Oct 7</title></rect></svg>)))
      .toEqual(['aria-label=Followers over time', '12 on Oct 7'])
    expect(visibleValues(el(<button type="button" title="Hide this note">x</button>))).toEqual(['x', 'title=Hide this note'])
  })
})

describe('expectSameValues', () => {
  test('passes on the same text in different markup and different classes', () => {
    expect(() => expectSameValues(
      el(<div className="rounded-lg"><p className="text-xs">Views</p><p>42</p></div>),
      el(<section className="_kpi_e1fd3b"><h3>Views</h3><span><b>42</b></span></section>),
    )).not.toThrow()
  })
  test('fails on a changed number, a changed label and a changed tooltip, naming what differs', () => {
    const base = el(<div><p>Views</p><p>42</p><span role="tooltip">Views shown.<i /></span></div>)
    expect(() => expectSameValues(base, el(<div><p>Views</p><p>43</p><span role="tooltip">Views shown.<i /></span></div>))).toThrow(/43/)
    expect(() => expectSameValues(base, el(<div><p>Reach</p><p>42</p><span role="tooltip">Views shown.<i /></span></div>))).toThrow(/Reach/)
    expect(() => expectSameValues(base, el(<div><p>Views</p><p>42</p><span role="tooltip">Impressions.<i /></span></div>))).toThrow(/Impressions/)
  })
  test('fails when either side rendered nothing', () => {
    expect(() => expectSameValues(el(<div />), el(<div />))).toThrow(/nothing/)
    expect(() => expectSameValues(el(<p>42</p>), el(<div />))).toThrow(/nothing/)
  })
  test('fails when either side is only a fallback card, which would otherwise compare equal (the trial on #490 hit this)', () => {
    for (const text of ["Couldn't load this section.", 'No data for this period.', 'Taking longer than usual. Try again in a minute.']) {
      expect(() => expectSameValues(el(<div>{text}</div>), el(<div>{text}</div>)), text).toThrow(/fallback/)
    }
    expect(() => expectSameValues(el(<p>42</p>), el(<div>No data for this period.</div>))).toThrow(/fallback/)
  })
  test('recognises every card the real Fallback and NoData components draw, so the list cannot drift from them', () => {
    const cards = [
      <Fallback key="e" kind="error" />,
      <Fallback key="t" kind="timeout" />,
      <Fallback key="y" kind="timeout" timeoutText={YTD_TIMEOUT_TEXT} />,
      <NoData key="n" />,
    ]
    for (const card of cards) expect(() => expectSameValues(el(card), el(card))).toThrow(/fallback/)
  })
  test('a fallback beside real values is not fallback-only, so a part that shows one error card among its tiles still compares', () => {
    expect(() => expectSameValues(
      el(<div><p>42</p><Fallback kind="error" /></div>),
      el(<div><p>42</p><Fallback kind="error" /></div>),
    )).not.toThrow()
  })
})
