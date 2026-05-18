import { NextRequest, NextResponse } from 'next/server'
import { getClientBySlug } from '@/lib/clients.config'
import { normalizeArticle, type RawArticle } from '@/lib/newsapi'

const NEWSAPI_BASE = 'https://eventregistry.org/api/v1'

export async function GET(req: NextRequest) {
  const clientSlug = req.nextUrl.searchParams.get('clientSlug')
  if (!clientSlug) {
    return NextResponse.json({ error: 'clientSlug required' }, { status: 400 })
  }

  const client = getClientBySlug(clientSlug)
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  if (!client.prConfig) {
    return NextResponse.json({ error: 'No PR config for this client' }, { status: 404 })
  }

  const apiKey = process.env.NEWSAPI_AI_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'NEWSAPI_AI_KEY not configured' }, { status: 500 })
  }

  const { prConfig } = client
  const dataTypes = prConfig.dataTypes ?? ['news', 'pr']

  const body = {
    action: 'getArticles',
    keyword: prConfig.keywords,
    keywordOper: 'or',
    ...(prConfig.excludeKeywords?.length && { ignoreKeyword: prConfig.excludeKeywords }),
    ...(prConfig.sourceLocationUri?.length && { sourceLocationUri: prConfig.sourceLocationUri }),
    ...(prConfig.language && { lang: prConfig.language }),
    articlesPage: 1,
    articlesCount: 100,
    articlesSortBy: 'date',
    articlesSortByAsc: false,
    articleBodyLen: 0,
    dataType: dataTypes,
    forceMaxDataTimeWindow: prConfig.lookbackDays === 7 ? 7 : 31,
    resultType: 'articles',
    includeArticleTitle: true,
    includeArticleUrl: true,
    includeArticleSource: true,
    includeArticleDate: true,
    includeArticleSocialScore: true,
    includeArticleSentiment: true,
    includeSourceTitle: true,
    includeSourceImportanceRank: true,
    includeSourceAlexaGlobalRank: true,
    ignoreSourceGroupUri: 'paywall/paywalled_sources',
    apiKey,
  }

  try {
    const res = await fetch(`${NEWSAPI_BASE}/article/getArticles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      next: { revalidate: 3600 }, // 1-hour cache to conserve tokens
    })

    if (!res.ok) throw new Error(`NewsAPI returned ${res.status}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)

    const rawArticles: RawArticle[] = data.articles?.results ?? []
    const placements = rawArticles.map((a) => normalizeArticle(a, 'news'))

    return NextResponse.json({
      placements,
      totalResults: data.articles?.totalResults ?? placements.length,
      clientSlug,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
