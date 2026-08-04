import { expect, test } from 'vitest'
import { DashSocialClient } from './client'

function captureClient() {
  const urls: string[] = []
  const fetchImpl = (async (url: string) => {
    urls.push(String(url))
    return new Response(JSON.stringify({ data: { content: [] } }), { status: 200 })
  }) as unknown as typeof fetch
  return { client: new DashSocialClient({ token: 't', fetchImpl }), urls }
}

test('getContent sends an explicit limit', async () => {
  const { client, urls } = captureClient()
  await client.getContent({ brandId: 26952, channel: 'INSTAGRAM', metric: 'TOTAL_ENGAGEMENTS', startDate: '2026-06-01', endDate: '2026-06-30', limit: 500 })
  expect(urls[0]).toContain('limit=500')
})

test('getContent does NOT send aggregate_by (returns 0 items on CONTENT)', async () => {
  const { client, urls } = captureClient()
  await client.getContent({ brandId: 26952, channel: 'INSTAGRAM', metric: 'TOTAL_ENGAGEMENTS', startDate: '2026-06-01', endDate: '2026-06-30', limit: 500 })
  expect(urls[0]).not.toContain('aggregate_by')
})

test('getContent sets report_type=CONTENT and the single channel + metric', async () => {
  const { client, urls } = captureClient()
  await client.getContent({ brandId: 26952, channel: 'LINKEDIN', metric: 'ENGAGEMENTS_BY_POST', startDate: '2026-06-01', endDate: '2026-06-30', limit: 500 })
  expect(urls[0]).toContain('report_type=CONTENT')
  expect(urls[0]).toContain('channels=LINKEDIN')
  expect(urls[0]).toContain('metrics=ENGAGEMENTS_BY_POST')
})
