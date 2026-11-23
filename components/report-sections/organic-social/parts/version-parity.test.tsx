// The value-equality helper every new part version is proven with (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md,
// Task 1). These tests pin what it compares and, as importantly, what it refuses to call equal.
import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expectSameValues, visibleValues } from './version-parity'
import { Fallback, YTD_TIMEOUT_TEXT } from './shared'
import { NoData } from '../no-data'
import { AeoTable } from '../aeo-informed/aeo-table'
import { NO_DATA_FOR_WINDOW, NO_SOURCE_DATA, TABLE_EMPTY, TIMEOUT_TEXT, notStartedText } from '../aeo-informed/copy'

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
  // A fallback card is recognised by the card style the error and empty cards share, not by its wording, so a custom
  // message is caught too (Paul, #494 / issue #495). Every card below is the real component, so a restyle that stopped
  // the helper recognising one fails here instead of silently letting a parity test pass on nothing.
  const cards: [string, React.ReactElement][] = [
    ['the error card', <Fallback key="e" kind="error" />],
    ['the timeout card', <Fallback key="t" kind="timeout" />],
    ['the YTD timeout card', <Fallback key="y" kind="timeout" timeoutText={YTD_TIMEOUT_TEXT} />],
    ['the empty card', <NoData key="n" />],
    ['an empty card with a message nobody has written yet', <NoData key="c" message="Something new went missing." />],
    ['AEO: not started (copy.ts:56)', <NoData key="a1" message={notStartedText('November 2026')} />],
    ['AEO: no data for this window (copy.ts:57)', <NoData key="a2" message={NO_DATA_FOR_WINDOW} />],
    ['AEO: the Peec timeout (copy.ts:58)', <Fallback key="a3" kind="timeout" timeoutText={TIMEOUT_TEXT} />],
    ['AEO: no source data (copy.ts:21, graphs.tsx:52)', <NoData key="a4" message={NO_SOURCE_DATA} />],
  ]
  test.each(cards)('fails when either side is only %s, which would otherwise compare equal', (_name, card) => {
    expect(() => expectSameValues(el(card), el(card))).toThrow(/only a fallback card/)
    expect(() => expectSameValues(el(card), el(card), { allowFallback: true })).toThrow(/only a fallback card/)
    expect(() => expectSameValues(el(<p>42</p>), el(card))).toThrow(/fallback/)
  })
  test("fails on AEO's empty table card (aeo-table.tsx:110), drawn by the real table with no rows", () => {
    const table = () => el(<AeoTable kind="socials" rows={[]} brands={[]} showChange={false} />)
    expect(visibleValues(table())).toContain(TABLE_EMPTY)
    expect(() => expectSameValues(table(), table())).toThrow(/fallback card/)
  })
  test('fails on a fallback card beside other text unless the test opts in: the AEO error shape, controls then the card (section.tsx:74)', () => {
    const controls = <div><button type="button">This month</button><p>Oct 1 to Oct 31, vs the prior 31 days</p></div>
    const aeoError = () => el(<div>{controls}<Fallback kind="error" /></div>)
    expect(() => expectSameValues(aeoError(), aeoError())).toThrow(/allowFallback/)
    expect(() => expectSameValues(aeoError(), aeoError(), { allowFallback: true })).not.toThrow()
  })
  test('with the opt-in, one error card among real tiles still compares, and a changed tile still fails', () => {
    const tiles = (n: string) => el(<div><p>{n}</p><Fallback kind="error" /></div>)
    expect(() => expectSameValues(tiles('42'), tiles('42'), { allowFallback: true })).not.toThrow()
    expect(() => expectSameValues(tiles('42'), tiles('43'), { allowFallback: true })).toThrow(/43/)
  })
  test('text nested inside a card is the card, and the classes may come in any order', () => {
    // No card does this today (each holds its text directly), so this pins the rule for one that wraps its message.
    const nested = () => el(<div className="text-text-muted p-6 rounded-lg text-sm border bg-bg-surface border-white/[0.06]"><span>Still loading.</span></div>)
    expect(() => expectSameValues(nested(), nested())).toThrow(/only a fallback card/)
  })
  test('the same words outside a card are a value, not a fallback: the rule is the card, never the wording', () => {
    expect(() => expectSameValues(el(<p>No data for this period.</p>), el(<p>No data for this period.</p>))).not.toThrow()
  })
})
