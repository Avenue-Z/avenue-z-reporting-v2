/** Static section header. Pure presentation — no data fetching. The kebab
 *  on the surrounding <BlockChrome> handles delete; range overrides are
 *  meaningless here (no data) but the menu still shows them for uniformity. */
export function HeaderBlockBody({ name, level }: { name: string; level?: 1 | 2 | 3 }) {
  const lvl = level ?? 2
  const cls =
    lvl === 1 ? 'text-2xl font-extrabold uppercase tracking-widest text-white'
    : lvl === 2 ? 'text-lg font-extrabold uppercase tracking-widest text-white/90'
    : 'text-sm font-extrabold uppercase tracking-widest text-text-muted'
  if (lvl === 1) return <h1 className={`px-1 py-2 ${cls}`}>{name}</h1>
  if (lvl === 2) return <h2 className={`px-1 py-2 ${cls}`}>{name}</h2>
  return <h3 className={`px-1 py-2 ${cls}`}>{name}</h3>
}
