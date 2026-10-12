/** The one line shown instead of Organic Social's parts when a viewer has no reporting months
 *  (locked months spec 3.8). */
export function NoMonths({ text }: { text: string }) {
  return <p className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5 text-sm text-text-muted">{text}</p>
}
