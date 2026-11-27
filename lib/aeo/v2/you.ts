// One authoritative "you" for the v2 visibility tables and trends. A configured client brand name is the only authority
// when set: the brand whose name equals it (exact, case and whitespace insensitive; never a substring), else nobody.
// Only without a configured name does the provider's own flag decide.
export function resolveYou(brands: readonly { name: string; isOwn: boolean }[], yourBrand: string): string | null {
  const configured = yourBrand.trim()
  const wanted = configured.toLowerCase()
  const names: string[] = []
  for (const b of brands) {
    const match = wanted !== '' ? b.name.trim().toLowerCase() === wanted : b.isOwn
    if (match && !names.includes(b.name)) names.push(b.name)
  }
  if (names.length === 0) {
    if (wanted !== '') console.warn(`[aeo-v2] no tracked brand is named "${configured}"`)
    return null
  }
  if (names.length > 1) console.warn(`[aeo-v2] several brands match the client: ${names.join(', ')}; using ${names[0]}`)
  return names[0]
}
