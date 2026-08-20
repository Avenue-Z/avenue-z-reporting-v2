import { expect, test } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DemandJourney, type DemandStage } from './demand-journey'
import { buildStages } from './stages'

const live: DemandStage = {
  key: 'ga4', source: 'Web Analytics', label: 'Site Sessions',
  metric: '89,234', subMetric: '2.1% conv. rate', delta: 15.4,
  color: '#4285F4',
  stats: [{ label: 'Active Users', value: '62,108' }],
}

const unconnected: DemandStage = {
  key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
  color: '#F5A623',
  connected: false,
}

test('a connected stage renders its metric', () => {
  render(<DemandJourney stages={[live]} />)
  expect(screen.getByText('89,234')).toBeInTheDocument()
})

test('an unconnected stage renders the needs-connection treatment instead of a metric', () => {
  render(<DemandJourney stages={[unconnected]} />)
  expect(screen.getByText(/Not connected/i)).toBeInTheDocument()
})

test('a configured AEO stage whose fetch failed renders a dash, never "Not connected" or a connect prompt', () => {
  // Getting ahead of a round-4 finding: a configured client with an
  // AI-visibility outage must not be told to connect a working source.
  const aeoFailed = buildStages({
    totals: {}, cmpTotals: {}, peec: null, peecConnected: true, trendRows: [],
  }).find((s) => s.key === 'aeo')!
  render(<DemandJourney stages={[aeoFailed]} />)
  expect(screen.queryByText(/Not connected/i)).toBeNull()
  expect(screen.queryByText(/Connect AI visibility tracking/i)).toBeNull()
  expect(screen.getAllByText('—').length).toBeGreaterThan(0) // dashes, not a connect prompt
})

test('an unconnected stage still shows its source label, so the row reads as a funnel', () => {
  render(<DemandJourney stages={[unconnected]} />)
  expect(screen.getByText('Pipeline')).toBeInTheDocument()
})

test('an unconnected stage renders no delta, so no false arrow appears', () => {
  const { container } = render(<DemandJourney stages={[unconnected]} />)
  expect(container.textContent ?? '').not.toMatch(/%/)
})

test('an unconnected stage with a stale delta still renders no arrow', () => {
  const { container } = render(<DemandJourney stages={[{ ...unconnected, delta: 5.2 }]} />)
  expect(container.textContent ?? '').not.toMatch(/%/)
})

test('all four stages render together in one row', () => {
  const stages = [live, { ...live, key: 'aeo', source: 'AEO' }, unconnected, { ...unconnected, key: 'inbound', source: 'Inbound Funnel' }]
  render(<DemandJourney stages={stages} />)
  expect(screen.getAllByText(/Not connected/i)).toHaveLength(2)
})

test('an unconnected sibling does not dim while another card is hovered', () => {
  render(<DemandJourney stages={[live, unconnected]} />)
  const liveCard = screen.getByText('Site Sessions').closest('.cursor-default')!
  fireEvent.mouseEnter(liveCard)
  const unconnectedCard = screen.getByText('Not connected').closest('.cursor-default')!
  expect(unconnectedCard.className).not.toContain('opacity-25')
})

test('a connected sibling still dims while another card is hovered', () => {
  const other = { ...live, key: 'aeo', source: 'AEO', label: 'AI Visibility' }
  render(<DemandJourney stages={[live, other]} />)
  const liveCard = screen.getByText('Site Sessions').closest('.cursor-default')!
  fireEvent.mouseEnter(liveCard)
  const otherCard = screen.getByText('AI Visibility').closest('.cursor-default')!
  expect(otherCard.className).toContain('opacity-25')
})

// Paul CR3 (207) finding: every card's delta caption hardcoded "vs prior
// period", even for the AEO card, whose delta compares the last two complete
// weeks, not a 30-day period.

test('a stage with its own deltaLabel renders that label, not the default', () => {
  const aeo: DemandStage = { ...live, key: 'aeo', source: 'AEO', deltaLabel: 'vs prior week' }
  render(<DemandJourney stages={[aeo]} />)
  expect(screen.getByText('vs prior week')).toBeInTheDocument()
  expect(screen.queryByText('vs prior period')).not.toBeInTheDocument()
})

test('a stage with no deltaLabel falls back to "vs prior period"', () => {
  render(<DemandJourney stages={[live]} />)
  expect(screen.getByText('vs prior period')).toBeInTheDocument()
})

test('the GA4 cards still read "vs prior period" alongside an AEO card reading "vs prior week"', () => {
  const aeo: DemandStage = { ...live, key: 'aeo', source: 'AEO', label: 'AI Visibility', deltaLabel: 'vs prior week' }
  const ga4: DemandStage = { ...live, key: 'ga4', source: 'Web Analytics', label: 'Site Sessions' }
  render(<DemandJourney stages={[aeo, ga4]} />)
  expect(screen.getByText('vs prior week')).toBeInTheDocument()
  expect(screen.getByText('vs prior period')).toBeInTheDocument()
})

// Paul CR2 (207) finding: the unconnected-state hero line hardcoded "Connect
// your CRM to see this" for every stage with connected === false, including
// the AEO stage, so a Peec outage told the client to connect a CRM, naming
// the wrong data source entirely.

test('an unconnected stage with a vendor-neutral hint never mentions CRM', () => {
  const aeoUnconnected: DemandStage = {
    key: 'aeo', source: 'AEO', label: 'AI Visibility',
    color: '#00D9FF',
    connected: false,
    unconnectedHint: 'Connect AI visibility tracking to see this',
  }
  render(<DemandJourney stages={[aeoUnconnected]} />)
  const card = screen.getByText('AI Visibility').closest('.cursor-default')!
  expect(card.textContent ?? '').not.toContain('CRM')
  expect(screen.getByText('Connect AI visibility tracking to see this')).toBeInTheDocument()
})

test('an unconnected CRM stage still mentions CRM via its own hint', () => {
  const crmUnconnected: DemandStage = {
    ...unconnected,
    unconnectedHint: 'Connect your CRM to see this',
  }
  render(<DemandJourney stages={[crmUnconnected]} />)
  const card = screen.getByText('Pipeline').closest('.cursor-default')!
  expect(card.textContent ?? '').toContain('CRM')
})

test('an unconnected stage with no hint at all falls back to vendor-neutral copy, not CRM wording', () => {
  render(<DemandJourney stages={[unconnected]} />)
  const card = screen.getByText('Pipeline').closest('.cursor-default')!
  expect(card.textContent ?? '').not.toContain('CRM')
})

// Paul CR2 (207) finding: `connected: crm` was set on the two CRM stages
// without ever giving them a `metric`, so a CRM-configured client saw a
// label rendered above a blank hero line. The fix removed the flag, but this
// is the general guard against the whole class of bug: any stage marked
// connected must render a non-empty hero metric, not just carry the right
// boolean.
test('every stage in the real built set shows either the not-connected treatment or a non-empty hero metric', () => {
  const fullTotals = { sessions: 89234, activeUsers: 62108, newUsers: 34872, conversions: 1847, bounceRate: 0.384, sessionConversionRate: 0.021 }
  const cmpTotals = { sessions: 77300 }
  const peec = {
    weeklyVisibility: [{ weekStart: '2020-01-06', visibility: 22.1 }, { weekStart: '2020-01-13', visibility: 24.8 }],
    brandRankings: [{ name: 'Renaissance', sov: 11.3, isYou: true }],
    trackedPrompts: [{}],
  }
  const stages = buildStages({ totals: fullTotals, cmpTotals, peec, trendRows: [] })
  const { container } = render(<DemandJourney stages={stages} />)
  const cards = container.querySelectorAll('.cursor-default')
  expect(cards.length).toBe(stages.length)
  cards.forEach((card) => {
    const showsNotConnected = card.textContent?.includes('Not connected')
    // '.font-extrabold' is the hero metric <p>. It only renders on the
    // connected branch, never alongside the "Not connected" treatment.
    const hero = card.querySelector('.font-extrabold')
    if (showsNotConnected) {
      expect(hero).toBeNull()
    } else {
      expect(hero?.textContent?.trim()).toBeTruthy()
    }
  })
})
