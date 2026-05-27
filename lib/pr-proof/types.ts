// ─── PR Proof Library Types ──────────────────────────────────────────────────
//
// Represents structured PR placement data from the PR Proof Google Sheet.
// Sheet schema: Client | Outlet | Headline | Publication Date | Link | Impact | Date Added
// ─────────────────────────────────────────────────────────────────────────────

/** Raw PR placement row from the PR Proof Library sheet */
export interface PRPlacement {
  client: string
  outlet: string
  headline: string
  publicationDate: string
  link: string
  /** Domain extracted from link URL (e.g. 'fortune.com') */
  domain: string
  impact: string
  dateAdded: string
}

/** PR placement enriched with Peec AI citation cross-reference data */
export interface PRPlacementMatchback extends PRPlacement {
  /** Whether this domain appears in Peec AI citation data */
  citedByAI: boolean
  /** Which AI engines cite this domain (e.g. ['ChatGPT', 'Gemini']) */
  aiEnginesCiting: string[]
  /** Number of prompts where this domain appears as a citation */
  promptCount: number
  /** Average position across prompts where this domain is cited */
  averagePosition: number | null
  /** Whether the brand is mentioned on this domain in AI citations */
  brandMentioned: boolean
}

/** Aggregated PR Proof data for a single client */
export interface PRProofData {
  /** All placements for this client */
  placements: PRPlacement[]
  /** Total number of placements */
  totalPlacements: number
  /** Unique outlet count */
  uniqueOutlets: number
  /** Unique domains with placements */
  uniqueDomains: string[]
  /** Date range of placements */
  dateRange: { earliest: string; latest: string } | null
}
