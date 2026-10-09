import { getSectionTemplate, type getClientBySlug } from '@/lib/db/queries'
import { influencerRulesFor, type InfluencerRules } from '@/lib/organic-social/influencer-tab'
import { CODE_TEMPLATES } from '../template'

/** The one rule for how a client's Instagram posts split into Organic and Influencer (Paul, #358 review): the platform
 *  layout's Top Content pin and the client's saved handle (influencerRulesFor). Overview's gallery (top-content@2) and
 *  the Influencer tab both read it, so a post is never Influencer on one page and nowhere on the other. The template is
 *  staging's row when it can be read, else the code default; a failed read keeps the code default. */
export async function splitRulesFor(client: Awaited<ReturnType<typeof getClientBySlug>>): Promise<InfluencerRules> {
  let template = CODE_TEMPLATES['organic-social:platform']
  try { template = (await getSectionTemplate('organic-social:platform')) ?? template } catch { /* the code template */ }
  return influencerRulesFor(template, client?.reportSectionConfig?.['organic-social:platform'], client?.dashSocialConfig)
}
