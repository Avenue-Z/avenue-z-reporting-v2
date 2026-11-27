import { cached } from '@/lib/cache'
import { peecGet } from './client'

export type PeecRosterBrand = { id: string; name: string; isOwn: boolean; domains: string[] }

type ApiBrand = { id: string; name: string; domains?: string[] | null; is_own?: boolean }

async function getPeecRosterImpl(projectId: string): Promise<PeecRosterBrand[]> {
  const res = await peecGet<{ data: ApiBrand[] }>('/brands', { limit: '1000' }, projectId)
  return (res.data ?? []).map((b) => ({ id: b.id, name: b.name, isOwn: b.is_own === true, domains: b.domains ?? [] }))
}

export const getPeecRoster = cached('peec', 'getRoster', getPeecRosterImpl, {
  version: 'v1',
  ttlSeconds: 86_400,
  healthCritical: false,
  extractTags: ([projectId]) => ({ project: projectId }),
})
