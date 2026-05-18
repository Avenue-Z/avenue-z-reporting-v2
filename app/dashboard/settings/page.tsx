import { getAllClients } from '@/lib/clients.config'
import { REPORT_NAMES } from '@/lib/constants'
import { Header } from '@/components/layout/header'
import {
  CheckCircle2,
  XCircle,
  Shield,
  Database,
  Brain,
  Newspaper,
  Search,
  Users,
  Settings,
} from 'lucide-react'

const API_CONNECTIONS = [
  {
    name: 'BigQuery',
    description: 'avenue-z-data-warehouse-prod',
    status: !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    icon: Database,
  },
  {
    name: 'Gemini AI',
    description: 'Vertex AI — gemini-2.5-flash-lite',
    status: !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    icon: Brain,
  },
  {
    name: 'NewsAPI.ai',
    description: 'PR Placements tracking',
    status: !!process.env.NEWSAPI_AI_KEY,
    icon: Newspaper,
  },
  {
    name: 'Glean / Z/OS',
    description: 'Meeting Prep briefs',
    status: !!process.env.GLEAN_API_TOKEN,
    icon: Search,
  },
]

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#60FF80]/30 px-2.5 py-1 text-xs font-bold text-[#60FF80]">
      <CheckCircle2 className="h-3 w-3" />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs font-bold text-text-muted">
      <XCircle className="h-3 w-3" />
      Not configured
    </span>
  )
}

export default function SettingsPage() {
  const clients = getAllClients()

  // Collect all team members across all clients
  const teamMembers = clients.flatMap((client) =>
    client.users.map((user) => ({
      email: user.email,
      role: user.role,
      clientName: client.name,
      clientSlug: client.slug,
    }))
  )

  // Deduplicate by email, group their clients
  const memberMap = new Map<string, { email: string; role: string; clients: string[] }>()
  for (const member of teamMembers) {
    const existing = memberMap.get(member.email)
    if (existing) {
      if (!existing.clients.includes(member.clientName)) {
        existing.clients.push(member.clientName)
      }
    } else {
      memberMap.set(member.email, {
        email: member.email,
        role: member.role,
        clients: [member.clientName],
      })
    }
  }
  const uniqueMembers = Array.from(memberMap.values())

  return (
    <>
      <Header title="Settings" />
      <div className="divider-full mb-8" />

      <div className="space-y-10">
        {/* Profile */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-text-muted" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">
              Profile
            </h2>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-bg-surface p-6">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.08] text-lg font-bold text-white">
                BH
              </span>
              <div>
                <p className="text-base font-bold text-white">Bill Hoerr</p>
                <p className="text-sm text-text-muted">bill@avenuez.com</p>
              </div>
              <span className="ml-auto inline-flex items-center rounded-full border border-brand-cyan/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-cyan">
                Internal Admin
              </span>
            </div>
          </div>
        </section>

        {/* API Connections */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-text-muted" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">
              API Connections
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {API_CONNECTIONS.map((api) => (
              <div
                key={api.name}
                className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                  <api.icon className="h-5 w-5 text-text-muted" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{api.name}</p>
                  <p className="truncate text-xs text-text-muted">{api.description}</p>
                </div>
                <StatusBadge connected={api.status} />
              </div>
            ))}
          </div>
        </section>

        {/* Client Overview */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Settings className="h-4 w-4 text-text-muted" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">
              Client Overview
            </h2>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-bg-surface">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">
                    Client
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-muted">
                    Active Reports
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">
                    Enabled Platforms
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const platformReports = client.enabledReports.filter(
                    (r) => !['meeting-prep', 'conversational-summary', 'ffci', 'pr-placements', 'exec-summary', 'blended-performance'].includes(r)
                  )
                  return (
                    <tr
                      key={client.slug}
                      className="border-b border-white/[0.04] last:border-0"
                    >
                      <td className="px-5 py-3 font-semibold text-white">
                        {client.name}
                      </td>
                      <td className="px-5 py-3 text-center text-white/70">
                        {client.enabledReports.length}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {platformReports.map((slug) => (
                            <span
                              key={slug}
                              className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-white/60"
                            >
                              {REPORT_NAMES[slug] ?? slug}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Team Members */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-text-muted" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">
              Team Members
            </h2>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-bg-surface">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">
                    Email
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">
                    Role
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">
                    Clients
                  </th>
                </tr>
              </thead>
              <tbody>
                {uniqueMembers.map((member) => (
                  <tr
                    key={member.email}
                    className="border-b border-white/[0.04] last:border-0"
                  >
                    <td className="px-5 py-3 font-semibold text-white">
                      {member.email}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                          member.role.includes('INTERNAL')
                            ? 'border-brand-cyan/30 text-brand-cyan'
                            : 'border-brand-yellow/30 text-brand-yellow'
                        }`}
                      >
                        {member.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white/70">
                      {member.clients.length === clients.length
                        ? 'All clients'
                        : member.clients.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}
