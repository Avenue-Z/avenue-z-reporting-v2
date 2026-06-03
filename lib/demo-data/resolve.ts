/**
 * Single source of truth for "is demoMode effective for this request?"
 *
 * Demo mode is **strictly opt-in via the users.demoMode DB flag.** Only
 * users whose row in the users table has demo_mode = true can see
 * demo content. The sidebar toggle lets them temporarily turn it off
 * for their session (via a 'demoMode' cookie value of 'off').
 *
 * Non-demo users cannot enable demo mode by URL flag, cookie tampering,
 * or any other client-side trick — the DB flag is the gate.
 *
 * Resolution:
 *   userDemoFlag === false  → off, always
 *   userDemoFlag === true   → on, unless the cookie is explicitly 'off'
 */
export function resolveDemoMode(opts: {
  userDemoFlag: boolean        // session.user.demoMode === true
  cookieValue:  string | undefined  // 'on', 'off', or undefined
}): boolean {
  if (!opts.userDemoFlag) return false
  return opts.cookieValue !== 'off'
}
