// A featured post's screenshot (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, section 8).
// `/api` is outside the proxy's matcher (proxy.ts), so this route does every check itself (imageAccess) and answers
// 404 to anything it may not show, so a refusal never says whether the image exists.
import { type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { requestClock } from '@/lib/organic-social/locked-range'
import { imageAccess } from '@/lib/organic-social/social-listening/image-access'
import { findImage } from '@/lib/organic-social/social-listening/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const who = session?.user
  if (!who) return notFound()
  const { id } = await ctx.params
  if (!UUID.test(id)) return notFound()
  const print = req.nextUrl.searchParams.get('print') === '1'

  let img: Awaited<ReturnType<typeof findImage>>
  try {
    img = await findImage(id, print)
  } catch (e) {
    const code = typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : 'none'
    console.error(`[social-listening] image read failed id=${id} code=${code}`)
    return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!img || !imageAccess(who, img, requestClock())) return notFound()

  // An image never changes (an edit copies it under a new id), so each viewer fetches it once.
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Length': String(img.bytes.length),
    },
  })
}
