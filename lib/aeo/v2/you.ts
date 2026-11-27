// One authoritative "you" for the v2 visibility tables and trends. A configured client brand name is the only authority
// when set: the brand whose name equals it (exact, case and whitespace insensitive; never a substring), else nobody.
// Only without a configured name does the provider's own flag decide; with one, it only breaks a tie between exact matches.
export function resolveYou(brands: readonly { name: string; isOwn: boolean }[], yourBrand: string): string | null {
  const configured = yourBrand.trim()
  const wanted = configured.toLowerCase()
  const matches: { name: string; isOwn: boolean }[] = []
  for (const b of brands) {
    const match = wanted !== '' ? b.name.trim().toLowerCase() === wanted : b.isOwn
    if (!match) continue
    const seen = matches.find((m) => m.name === b.name)
    if (seen) seen.isOwn ||= b.isOwn
    else matches.push({ name: b.name, isOwn: b.isOwn })
  }
  if (matches.length === 0) {
    if (wanted !== '') console.warn(`[aeo-v2] no tracked brand is named "${configured}"`)
    return null
  }
  // Several matches (two brands spelled alike): the provider's own brand wins the tie, else the first (best-ranked).
  const chosen = (matches.find((m) => m.isOwn) ?? matches[0]).name
  if (matches.length > 1) console.warn(`[aeo-v2] several brands match the client: ${matches.map((m) => m.name).join(', ')}; using ${chosen}`)
  return chosen
}
