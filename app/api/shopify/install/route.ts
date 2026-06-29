/**
 * Step 1 of the Shopify OAuth bootstrap. Visit
 *   /api/shopify/install?shop=bright-patches.myshopify.com
 * to redirect to Shopify's consent screen. A one-shot `state` nonce is stored
 * in an httpOnly cookie and checked by the callback (CSRF protection).
 *
 * One-time, local use only (mints an offline Admin API token). Not gated by
 * auth (proxy.ts only guards /dashboard, /portal, /tools).
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { buildInstallUrl, isValidShop } from '@/lib/shopify/oauth'

export const dynamic = 'force-dynamic'

const DEFAULT_SHOP = 'bright-patches.myshopify.com'
const SCOPES = 'read_reports'

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop') ?? DEFAULT_SHOP
  if (!isValidShop(shop)) {
    return NextResponse.json({ error: `Invalid shop domain: ${shop}` }, { status: 400 })
  }
  const clientId = process.env.SHOPIFY_KIND_PATCHES_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'SHOPIFY_KIND_PATCHES_CLIENT_ID is not set in .env.local' },
      { status: 500 },
    )
  }

  const state = crypto.randomBytes(16).toString('hex')
  const redirectUri = new URL('/api/shopify/callback', req.nextUrl.origin).toString()
  const installUrl = buildInstallUrl({ shop, clientId, scopes: SCOPES, redirectUri, state })

  const res = NextResponse.redirect(installUrl)
  const cookieOpts = { httpOnly: true as const, sameSite: 'lax' as const, maxAge: 600, path: '/' }
  res.cookies.set('shopify_oauth_state', state, cookieOpts)
  res.cookies.set('shopify_oauth_shop', shop, cookieOpts)
  return res
}
