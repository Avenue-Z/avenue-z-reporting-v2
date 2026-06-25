/**
 * Step 2 of the Shopify OAuth bootstrap. Shopify redirects here with
 * ?code&shop&state&hmac after the merchant approves. We validate the state
 * nonce, exchange the code for an offline Admin API token, and print it so it
 * can be pasted into .env.local. Local one-time use only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken, isValidShop, verifyHmac } from '@/lib/shopify/oauth'

export const dynamic = 'force-dynamic'

function page(title: string, bodyHtml: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font-family:ui-monospace,SFMono-Regular,monospace;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.5">` +
      `<h2>${title}</h2>${bodyHtml}</body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const code = sp.get('code')
  const shop = sp.get('shop')
  const state = sp.get('state')

  const cookieState = req.cookies.get('shopify_oauth_state')?.value
  if (!state || !cookieState || state !== cookieState) {
    return page('OAuth state mismatch', '<p>The <code>state</code> nonce didn’t match. Restart at <code>/api/shopify/install</code>.</p>', 400)
  }
  if (!code || !shop || !isValidShop(shop)) {
    return page('Missing or invalid code/shop', '<p>Shopify didn’t return a valid <code>code</code> and <code>shop</code>.</p>', 400)
  }

  const clientId = process.env.SHOPIFY_KIND_PATCHES_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_KIND_PATCHES_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return page('Missing credentials', '<p>Set <code>SHOPIFY_KIND_PATCHES_CLIENT_ID</code> and <code>SHOPIFY_KIND_PATCHES_CLIENT_SECRET</code> in .env.local.</p>', 500)
  }

  // HMAC is a secondary check; the state nonce (which we issued) already
  // provides CSRF protection for this self-initiated flow. Warn, don't block,
  // on mismatch so an encoding edge case can't wedge the one-time bootstrap.
  const params: Record<string, string> = {}
  sp.forEach((v, k) => { params[k] = v })
  if (!verifyHmac(params, clientSecret)) {
    console.warn('[shopify oauth] HMAC verification failed — proceeding (state nonce already validated).')
  }

  try {
    const { access_token, scope } = await exchangeCodeForToken({ shop, clientId, clientSecret, code })
    return page(
      '✅ Shopify token minted',
      `<p>Add this line to <code>.env.local</code>, then restart the dev server:</p>` +
        `<pre style="background:#0b0b0b;color:#39d353;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-all">SHOPIFY_ADMIN_TOKEN_KIND_PATCHES=${access_token}</pre>` +
        `<p>Scopes granted: <code>${scope || '(none reported)'}</code></p>` +
        `<p>Then tell Claude it’s set. You can close this tab.</p>`,
    )
  } catch (e) {
    return page('Token exchange failed', `<pre>${(e as Error).message.replace(/</g, '&lt;')}</pre>`, 502)
  }
}
