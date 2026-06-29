/** Graceful fallback for any block.kind that has no renderer yet. Lets new
 *  kinds ship in the schema before their renderers ship (the page dispatcher
 *  returns this for the default case). */
export function UnsupportedBlockState({ kind, name }: { kind: string; name: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/[0.15] bg-bg-surface px-6 py-5 min-h-[140px]">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <p className="mt-2 text-sm text-white/70">
        Block type <span className="font-mono text-white/90">{kind}</span> isn’t available in this version.
      </p>
      <p className="mt-1 text-xs text-text-muted">Delete this block or wait for the next release.</p>
    </div>
  )
}
