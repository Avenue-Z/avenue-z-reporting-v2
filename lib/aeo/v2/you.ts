// One authoritative "you" for the v2 visibility tables and trends: the provider's own-flag brand, or the brand whose
// name equals the client's configured brand (exact, case and whitespace insensitive; never a substring).
export function resolveYou(brands: readonly { name: string; isOwn: boolean }[], yourBrand: string): string | null {
  const wanted = yourBrand.trim().toLowerCase()
  const names: string[] = []
  for (const b of brands) {
    if ((b.isOwn || (wanted !== '' && b.name.trim().toLowerCase() === wanted)) && !names.includes(b.name)) names.push(b.name)
  }
  if (names.length === 0) return null
  if (names.length > 1) console.warn(`[aeo-v2] several brands match the client: ${names.join(', ')}; using ${names[0]}`)
  return names[0]
}
