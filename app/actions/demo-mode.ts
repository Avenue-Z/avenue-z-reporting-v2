'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

/**
 * Toggle the demoMode cookie for the current session.
 *
 * Used by the <DemoModeToggle> control in the sidebar. The cookie
 * overrides the user's `users.demoMode` DB flag — letting a demo user
 * temporarily turn demo content off (to look at real data) without
 * needing a DB write or sign-out / sign-in.
 *
 * Logic in the route handlers:
 *   if (user is a demo user) demoMode = cookie !== 'off'
 *   else                      demoMode = cookie === 'on' || ?demo=1
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
