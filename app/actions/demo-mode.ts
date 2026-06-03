'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

/**
 * Toggle the demoMode cookie for the current session.
 *
 * Used by the <DemoModeToggle> control in the sidebar. Demo mode is
 * gated by the users.demoMode DB flag; this cookie only lets a demo
 * user temporarily turn it OFF for the session (to look at real data)
 * without a DB write or sign-out / sign-in. Non-demo users cannot set
 * this cookie to anything meaningful — the resolver ignores it.
 */
export async function setDemoMode(value: 'on' | 'off') {
  const store = await cookies()
  // 1 year expiry — long enough that toggling once persists across
  // the typical sales cycle. Path /, no scoping.
  store.set('demoMode', value, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false, // readable client-side so the toggle reflects current state
    sameSite: 'lax',
  })
  revalidatePath('/', 'layout')
}
