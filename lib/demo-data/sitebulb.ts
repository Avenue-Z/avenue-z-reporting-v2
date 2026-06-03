/**
 * Sample SitebulbData for demo mode. Drives the AEO checklist in
 * Technical Audit (httpsCoverage, titleTags, metaDescriptions, h1Tags,
 * canonicalTags). The hint keys match what buildAEOChecklist() in
 * lib/sitebulb/client.ts reads.
 */
import type { SitebulbData } from '@/lib/sitebulb/types'

export function sampleSitebulbData(): SitebulbData {
  return {
    current: {
      crawlDate: 'Jun 1, 2026',
      hints: {
        'Internal HTTP URLs':           0,
        'Title tag is missing':         3,
        'Meta description is missing': 47,
        '<h1> tag is missing':          8,
        'Missing canonical URL':       14,
      },
    },
    prev: {
      crawlDate: 'May 4, 2026',
      hints: {
        'Internal HTTP URLs':           2,
        'Title tag is missing':         7,
        'Meta description is missing': 64,
        '<h1> tag is missing':         12,
        'Missing canonical URL':       21,
      },
    },
  }
}
