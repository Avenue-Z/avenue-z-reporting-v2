'use client'

import { useState, useTransition } from 'react'
import { setSharedPasswordAction, setMaxSeatsAction, assignClientAdminAction } from '@/app/actions/client-access'
import { useRouter } from 'next/navigation'

interface Props {
  slug: string
  hasPassword: boolean
  maxSeats: number
  users: { id: string; email: string; role: string }[]
}

export function AccessPanel({ slug, hasPassword, maxSeats, users }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [seats, setSeats] = useState(maxSeats)
  const [adminEmail, setAdminEmail] = useState('')

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setMsg(null)
    start(async () => {
      const r = await action()
      setMsg(r.ok ? okMsg : (r.error ?? 'Something went wrong.'))
      if (r.ok) router.refresh()
    })
  }

  function savePassword() {
    setMsg(null)
    start(async () => {
      const r = await setSharedPasswordAction(slug, password)
      if (r.ok) { setMsg('Shared password updated.'); setPassword(''); router.refresh() }
      else setMsg(r.error ?? 'Something went wrong.')
    })
  }

  const inputCls = 'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none focus:border-white/20'
  const btnCls = 'rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50'

  return (
    <div className="space-y-8">
      {msg && <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white">{msg}</div>}

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Shared password {hasPassword ? '(set — entering a new one rotates it)' : '(not set yet)'}</h3>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New shared password" className={inputCls} />
        <button disabled={pending || !password} className={btnCls} onClick={savePassword}>Save password</button>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Seat limit (currently {users.length}/{maxSeats} used)</h3>
        <input type="number" min={1} max={100} value={seats} onChange={(e) => { const n = parseInt(e.target.value, 10); setSeats(Number.isNaN(n) ? 0 : n) }} className={inputCls} />
        <button disabled={pending} className={btnCls} onClick={() => run(() => setMaxSeatsAction(slug, seats), 'Seat limit updated.')}>Save seat limit</button>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Assign external admin</h3>
        <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@clientcompany.com" className={inputCls} />
        <button disabled={pending} className={btnCls} onClick={() => run(() => assignClientAdminAction(slug, adminEmail), 'External admin assigned.')}>Assign admin</button>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Current client-side users</h3>
        <ul className="space-y-1.5 text-sm text-white/80">
          {users.length === 0 && <li className="text-text-muted">None yet.</li>}
          {users.map((u) => <li key={u.id}>{u.email} — <span className="text-text-muted">{u.role.replaceAll('_', ' ')}</span></li>)}
        </ul>
      </section>
    </div>
  )
}
