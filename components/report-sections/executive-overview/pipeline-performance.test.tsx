import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelinePerformance } from './pipeline-performance'
import type { PipelineData } from '@/lib/salesforce/types'

/** Healthy baseline. Every figure is distinct so a getByText assertion cannot
 *  pass by coincidence: the parent plan's fixture reused 131 twice. */
function data(over: Partial<PipelineData> = {}): PipelineData {
  return {
    openDeals:        { value: 297 },
    totalPipeline:    { value: 4_820_000 },
    closedWon:        { value: 1_375_000, delta: 15.7 },
    weightedPipeline: { value: 2_140_000 },
    byOwner: [
      { owner: 'Dana Reyes', count: 41, amount: 900_000 },
      { owner: 'Sam Okonkwo', count: 18, amount: 410_000 },
    ],
    ownersTruncated: false,
    stageTruncated: false,
    unrecognizedClosedFlags: 0,
    wonStageUnmatched: false,
    openUnavailable: false,
    wonUnavailable: false,
    campaignScoped: false,
    openCampaignUnmatched: false,
    wonCampaignUnmatched: false,
    ownerCampaignUnmatched: false,
    ...over,
  }
}

describe('healthy render', () => {
  it('formats all four tile values', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.getByText('297')).toBeInTheDocument()
    expect(screen.getByText('$4,820,000')).toBeInTheDocument()
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
    expect(screen.getByText('$2,140,000')).toBeInTheDocument()
  })

  it('renders Closed Won\'s delta with its year-over-year label', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.getByText(/15\.7%\s*vs same period last year/)).toBeInTheDocument()
  })

  it('renders the owner list in the order given, with counts', () => {
    render(<PipelinePerformance data={data()} />)
    const owners = screen.getAllByTestId('owner-row').map((n) => n.textContent)
    expect(owners[0]).toContain('Dana Reyes')
    expect(owners[0]).toContain('41')
    expect(owners[1]).toContain('Sam Okonkwo')
  })

  it('renders no caveat lines when nothing is degraded', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.queryByTestId('caveat')).not.toBeInTheDocument()
  })
})

describe('openUnavailable', () => {
  it('dashes the three open tiles instead of showing $0, and leaves Closed Won alone', () => {
    render(<PipelinePerformance data={data({
      openDeals: { value: 0 }, totalPipeline: { value: 0 }, weightedPipeline: { value: 0 },
      openUnavailable: true,
    })} />)
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.getAllByText("Couldn't load open pipeline.")).toHaveLength(3)
    // Closed Won comes from a separate query with its own flag.
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
  })
})

describe('wonUnavailable', () => {
  it('dashes Closed Won and suppresses the fabricated -100 delta', () => {
    // The regression test. closedWon.delta is -100 whenever the current fetch
    // degraded to 0 against a healthy prior year.
    render(<PipelinePerformance data={data({
      closedWon: { value: 0, delta: -100 }, wonUnavailable: true,
    })} />)
    expect(screen.queryByText(/100\.0%/)).not.toBeInTheDocument()
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.getByText("Couldn't load closed-won data.")).toBeInTheDocument()
  })

  it('takes comparisonExpected off too: an unloadable tile promises nothing', () => {
    render(<PipelinePerformance data={data({
      closedWon: { value: 0, delta: -100 }, wonUnavailable: true,
    })} />)
    expect(screen.queryByText(/vs same period last year/)).not.toBeInTheDocument()
  })
})

describe('wonStageUnmatched', () => {
  it('dashes the value rather than publishing a plausible $0, and keeps the placeholder', () => {
    render(<PipelinePerformance data={data({
      closedWon: { value: 0, delta: -100 }, wonStageUnmatched: true,
    })} />)
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.queryByText(/100\.0%/)).not.toBeInTheDocument()
    expect(screen.getByText(/vs same period last year/)).toBeInTheDocument()
    expect(screen.getByText(/won stage.*renamed/i)).toBeInTheDocument()
  })

  it('yields to wonUnavailable when both are set', () => {
    render(<PipelinePerformance data={data({
      closedWon: { value: 0 }, wonUnavailable: true, wonStageUnmatched: true,
    })} />)
    expect(screen.getByText("Couldn't load closed-won data.")).toBeInTheDocument()
    expect(screen.queryByText(/won stage.*renamed/i)).not.toBeInTheDocument()
  })
})

describe('baseline-corrupting flags suppress the delta but keep the value', () => {
  it('stageTruncated: value stays, delta goes, placeholder and caveat render', () => {
    // The flag ORs in wonPriorRows.length >= STAGE_MAX_ROWS (pipeline.ts:296-299),
    // so a truncated baseline inflates the growth percentage without bound.
    render(<PipelinePerformance data={data({ stageTruncated: true })} />)
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
    expect(screen.queryByText(/15\.7%/)).not.toBeInTheDocument()
    expect(screen.getByText(/vs same period last year/)).toBeInTheDocument()
    expect(screen.getByText(/row limit/i)).toBeInTheDocument()
  })

  it('unrecognizedClosedFlags: same treatment, and the caveat names the owner breakdown too', () => {
    // countUnrecognizedClosed includes ownerRows (pipeline.ts:295) and
    // transformByOwner drops unreadable rows (pipeline.ts:208), so a caveat
    // naming only "these totals" would leave the distorted list uncaveated.
    render(<PipelinePerformance data={data({ unrecognizedClosedFlags: 3 })} />)
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
    expect(screen.queryByText(/15\.7%/)).not.toBeInTheDocument()
    const caveat = screen.getByText(/unreadable open\/closed status/i)
    expect(caveat.textContent).toMatch(/3 rows/)
    expect(caveat.textContent).toMatch(/owner breakdown/i)
    // Rows, never deals: the open and won windows overlap, so one bad deal
    // can contribute more than once.
    expect(caveat.textContent).not.toMatch(/deals/i)
  })
})

describe('suppression that must not spread', () => {
  it('ownersTruncated keeps Closed Won\'s delta and adds no caveat to the grid', () => {
    render(<PipelinePerformance data={data({ ownersTruncated: true })} />)
    expect(screen.getByText(/15\.7%\s*vs same period last year/)).toBeInTheDocument()
    expect(screen.getByText('Owner list may be incomplete.')).toBeInTheDocument()
    expect(screen.queryByText(/row limit/i)).not.toBeInTheDocument()
  })
})

describe('owner list, three distinct states', () => {
  it('null renders a fetch failure, never "no owners"', () => {
    render(<PipelinePerformance data={data({ byOwner: null })} />)
    expect(screen.getByText('Owner breakdown unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('No open deals by owner.')).not.toBeInTheDocument()
  })

  it('[] renders a genuine empty, distinct from the failure copy', () => {
    render(<PipelinePerformance data={data({ byOwner: [] })} />)
    expect(screen.getByText('No open deals by owner.')).toBeInTheDocument()
    expect(screen.queryByText('Owner breakdown unavailable.')).not.toBeInTheDocument()
  })

  /**
   * The fourth state, and the reason ownerCampaignUnmatched is its own flag.
   * The breakdown is not a tile, so the caveat region \u2014 which now promises
   * to explain dashed TILES \u2014 does not reach it. Filtered to empty, the
   * list previously asserted "No open deals by owner.": a statement about this
   * client's deals, when the true statement is about the campaign filter.
   */
  it('an empty caused by the campaign filter says so, instead of claiming no open deals', () => {
    render(<PipelinePerformance data={data({
      byOwner: [], campaignScoped: true, ownerCampaignUnmatched: true,
    })} />)
    expect(screen.getByText(/no owners matched the agency-sourced campaigns/i)).toBeInTheDocument()
    // The two statements are mutually exclusive; printing both would be worse
    // than printing the wrong one.
    expect(screen.queryByText('No open deals by owner.')).not.toBeInTheDocument()
  })

  it('a scoped client whose owners DID match keeps the ordinary empty copy', () => {
    // ownerCampaignUnmatched, not campaignScoped, is what switches the copy: a
    // scoped client can legitimately have matching owners and no OPEN deals.
    render(<PipelinePerformance data={data({
      byOwner: [], campaignScoped: true, ownerCampaignUnmatched: false,
    })} />)
    expect(screen.getByText('No open deals by owner.')).toBeInTheDocument()
    expect(screen.queryByText(/no owners matched/i)).not.toBeInTheDocument()
  })

  it('a failed fetch still reads as unavailable, never as a campaign mismatch', () => {
    // byOwner null outranks the flag: pipeline.ts holds it false in this case,
    // and the list must not offer a scope explanation for an outage.
    render(<PipelinePerformance data={data({ byOwner: null, campaignScoped: true })} />)
    expect(screen.getByText('Owner breakdown unavailable.')).toBeInTheDocument()
    expect(screen.queryByText(/no owners matched/i)).not.toBeInTheDocument()
  })

  it('every owner at zero produces a finite width, never NaN%', () => {
    const { container } = render(<PipelinePerformance data={data({
      byOwner: [{ owner: 'Dana Reyes', count: 0, amount: 0 }],
    })} />)
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('window labels', () => {
  it('names each window on the section line and per tile', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.getByText('Open pipeline is as of today. Closed won is year to date.')).toBeInTheDocument()
    expect(screen.getAllByText('Open as of today')).toHaveLength(3)
    expect(screen.getByText('Year to date')).toBeInTheDocument()
  })

  it('a tile caveat replaces that tile\'s window label rather than joining it', () => {
    render(<PipelinePerformance data={data({ wonUnavailable: true })} />)
    expect(screen.queryByText('Year to date')).not.toBeInTheDocument()
    expect(screen.getByText("Couldn't load closed-won data.")).toBeInTheDocument()
    // The three open tiles keep theirs: this flag does not touch them.
    expect(screen.getAllByText('Open as of today')).toHaveLength(3)
  })
})

describe('vendor neutrality', () => {
  it('names no CRM vendor', () => {
    const { container } = render(<PipelinePerformance data={data({
      byOwner: null, ownersTruncated: true, stageTruncated: true,
      unrecognizedClosedFlags: 2, wonStageUnmatched: true,
      openUnavailable: true, wonUnavailable: true,
    })} />)
    expect(container.textContent ?? '').not.toMatch(/Salesforce|HubSpot/i)
  })
})

describe('campaign scoping disclosure', () => {
  it('says the figures are scoped when a campaign filter is active', () => {
    // Without this line the reader cannot tell a $51k agency slice from a $172M
    // whole-book figure. Both are "Total Pipeline" and both are true.
    render(<PipelinePerformance data={data({ campaignScoped: true })} />)
    expect(screen.getByText(/scoped to agency-sourced campaigns/i)).toBeInTheDocument()
  })

  it('says nothing about scoping when the whole CRM is reported', () => {
    render(<PipelinePerformance data={data({ campaignScoped: false })} />)
    expect(screen.queryByText(/scoped to agency-sourced campaigns/i)).not.toBeInTheDocument()
  })

  it('caveats a zero that came from matching no campaign, rather than showing a bare $0', () => {
    render(<PipelinePerformance data={data({
      campaignScoped: true,
      openCampaignUnmatched: true,
      wonCampaignUnmatched: true,
      openDeals: { value: 0 }, totalPipeline: { value: 0 },
      closedWon: { value: 0 }, weightedPipeline: { value: 0 },
    })} />)
    expect(screen.getByTestId('caveat')).toHaveTextContent(/no open or closed-won deals on the agency-sourced campaigns/i)
  })

  it('does not caveat when the filter matched normally', () => {
    render(<PipelinePerformance data={data({ campaignScoped: true })} />)
    expect(screen.queryByTestId('caveat')).not.toBeInTheDocument()
  })

  /**
   * The reviewed defect. openCampaignUnmatched and wonCampaignUnmatched describe
   * DIFFERENT windows on different date bases, and while pipeline.ts OR'd them
   * into one flag this block told a client with real open pipeline that all four
   * of their totals were 0. Open-pipeline-with-no-close-yet is the ordinary
   * opening state of a newly scoped client, so this is the common case, not an edge.
   */
  describe('the two unmatched windows are reported independently', () => {
    const openOnly = {
      campaignScoped: true,
      openCampaignUnmatched: false,
      wonCampaignUnmatched: true,
      totalPipeline: { value: 51_731 },
      closedWon: { value: 0 },
    }

    it('keeps the open tiles live when only the closed-won window matched nothing', () => {
      render(<PipelinePerformance data={data(openOnly)} />)
      expect(screen.getByText('$51,731')).toBeInTheDocument()
      // The old copy printed exactly this claim above that $51,731.
      expect(screen.getByTestId('caveat')).not.toHaveTextContent(/these totals are 0/i)
      expect(screen.getByTestId('caveat')).toHaveTextContent(/no closed-won deals/i)
      expect(screen.getByTestId('caveat')).not.toHaveTextContent(/no open deals/i)
    })

    it('dashes Closed Won rather than publishing its $0, the same as a renamed won stage', () => {
      render(<PipelinePerformance data={data(openOnly)} />)
      expect(screen.queryByText('$0')).not.toBeInTheDocument()
      expect(screen.getByText('No closed-won deals on the agency-sourced campaigns.')).toBeInTheDocument()
    })

    it('dashes the three open tiles and keeps Closed Won when only the open window matched nothing', () => {
      render(<PipelinePerformance data={data({
        campaignScoped: true,
        openCampaignUnmatched: true,
        wonCampaignUnmatched: false,
        openDeals: { value: 0 }, totalPipeline: { value: 0 }, weightedPipeline: { value: 0 },
        closedWon: { value: 1_375_000 },
      })} />)
      expect(screen.getByText('$1,375,000')).toBeInTheDocument()
      expect(screen.getAllByText('No open deals on the agency-sourced campaigns.')).toHaveLength(3)
      expect(screen.getByTestId('caveat')).toHaveTextContent(/no open deals/i)
      expect(screen.getByTestId('caveat')).not.toHaveTextContent(/closed-won/i)
    })
  })

  it('uses no em or en dash in the scoping copy, per the plan Global Constraints', () => {
    const { container } = render(<PipelinePerformance data={data({ campaignScoped: true, openCampaignUnmatched: true, wonCampaignUnmatched: true })} />)
    const scoping = [...container.querySelectorAll('p')]
      .map((p) => p.textContent ?? '')
      .filter((t) => /scoped to agency-sourced|agency-sourced campaigns/i.test(t))
    expect(scoping.length).toBeGreaterThan(0)
    for (const t of scoping) expect(t).not.toMatch(/[—–]/)
  })

  it('names no CRM vendor anywhere on screen', () => {
    const { container } = render(<PipelinePerformance data={data({ campaignScoped: true, openCampaignUnmatched: true, wonCampaignUnmatched: true })} />)
    expect(container.textContent ?? '').not.toMatch(/Salesforce|HubSpot/)
  })
})
