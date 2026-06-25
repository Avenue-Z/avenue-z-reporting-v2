'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviteTeammateAction, removeTeammateAction } from '@/app/actions/team'

interface Props {
  slug: string
  maxSeats: number
  selfEmail: string
  users: { id: string; email: string; role: string }[]
}

export function TeamPanel({ slug, maxSeats, selfEmail, users }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  const remaining = Math.max(0, maxSeats - users.length)

  function invite() {
    setMsg(null); setLink(null)
    start(async () => {
      const r = await inviteTeammateAction(slug, email)
      if (r.ok) { setMsg(`Invited ${email.trim().toLowerCase()}. Send them this link and the shared password.`); setLink(r.loginUrl ?? null); setEmail(''); router.refresh() }
      else setMsg(r.error ?? 'Something went wrong.')
    })
  }

  function remove(userId: string) {
    setMsg(null); setLink(null)
    start(async () => {
      const r = await removeTeammateAction(slug, userId)
      setMsg(r.ok ? 'Removed.' : (r.error ?? 'Something went wrong.'))
      if (r.ok) router.refresh()
    })
  }

  const inputCls = 'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none focus:border-white/20'

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">{remaining} of {maxSeats} seat{maxSeats !== 1 ? 's' : ''} remaining.</p>

      {msg && <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white">{msg}</div>}
      {link && (
        <div className="flex items-center gap-2">
          <input readOnly value={link} className={inputCls} onFocus={(e) => e.currentTarget.select()} />
          <button className="shrink-0 rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-white" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@email.com" className={inputCls} disabled={remaining === 0 || pending} />
        <button disabled={remaining === 0 || pending} className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black disabled:opacity-50" onClick={invite}>Invite</button>
      </div>

      <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-white">{u.email}{u.email === selfEmail ? ' (you)' : ''} <span className="ml-2 text-text-muted">{u.role.replaceAll('_', ' ')}</span></span>
            {u.role !== 'CLIENT_ADMIN' && u.email !== selfEmail && (
              <button disabled={pending} className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50" onClick={() => remove(u.id)}>Remove</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
