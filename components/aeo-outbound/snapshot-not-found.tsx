import Link from 'next/link'
import { cardCls, primaryBtnCls } from './ui'
import { BACK_TO_HUB, SNAPSHOT_GONE, SNAPSHOT_GONE_NOTE } from './messages'

/** Rendered by the editor page for a malformed id or a missing row (v1.1 §17.9). It is not a not-found.tsx file: the protected-pages guard forbids those under app/tools. */
export function SnapshotNotFound() {
  return (
    <section className={`${cardCls} max-w-xl`}>
      <h1 className="text-xl font-bold text-white">{SNAPSHOT_GONE}</h1>
      <p className="mt-2 text-sm text-text-muted">{SNAPSHOT_GONE_NOTE}</p>
      <Link href="/tools/new-business" className={`${primaryBtnCls} mt-4 inline-block`}>
        {BACK_TO_HUB}
      </Link>
    </section>
  )
}
