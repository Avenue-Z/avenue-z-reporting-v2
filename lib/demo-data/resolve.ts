/**
 * Single source of truth for "is demoMode effective for this request?"
 *
 * Combines three inputs:
 *   1. users.demoMode DB flag baked into the session JWT
 *      (session.user.demoMode === true) — the long-lived default for
 *      this user account.
 *   2. The `demoMode` cookie set by the <DemoModeToggle> sidebar control —
 *      lets the user override the default per-session without a DB write.
 *   3. The ?demo=1 URL query param — ad-hoc override for non-demo users
 *      who want to preview demo content (e.g. paul.ramirez checking a
 *      page before a CEO meeting).
 *
 * Resolution rules:
 *   - Demo user (DB flag set):
 *       cookie 'off'  → off (toggle explicitly disabled)
 *       cookie 'on' or unset → on (toggle default state, or never set)
 *   - Non-demo user:
 *       URL ?demo=1   → on (ad-hoc preview)
 *       cookie 'on'   → on (someone manually opted in)
 *       else          → off
 */
export function resolveDemoMode(opts: {
  userDemoFlag:    boolean        // session.user.demoMode === true
  cookieValue:     string | undefined  // 'on', 'off', or undefined
  urlDemoOverride: boolean        // ?demo=1 or &demo=true on the URL
}): boolean {
  if (opts.userDemoFlag) {
    return opts.cookieValue !== 'off'
  }
  return opts.urlDemoOverride || opts.cookieValue === 'on'
}
