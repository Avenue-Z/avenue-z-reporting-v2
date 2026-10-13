// Spec 2026-10-12-os-renaissance-locked-months-design.md 4.2b: for a client on locked months, a sidebar link that
// crosses the Organic Social boundary in either direction carries no dateRange or compareRange, so the other section
// opens on its own default and Organic Social opens on its default month. Pure and client-safe: both sidebars import it.

/** Whether the page is Organic Social: `?section=organic-social` on the reports page, or the deep-link route. */
export function isOrganicSocialView(pathname: string, section: string | null): boolean {
  if (pathname.endsWith('/reports/organic-social')) return true
  return pathname.endsWith('/reports') && section === 'organic-social'
}

/** Whether a link to `targetSection` keeps the page's range. */
export function carriesRange(lockedMonths: boolean, inOrganic: boolean, targetSection: string): boolean {
  return !lockedMonths || inOrganic === (targetSection === 'organic-social')
}
