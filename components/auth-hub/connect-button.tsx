/**
 * CredentialStatus — replaces the old Supermetrics ConnectButton.
 *
 * Integrations are now configured via environment variables, not OAuth flows.
 * GA4 uses a shared service account; HubSpot uses per-client Private App tokens.
 * This component displays a static badge indicating whether the env var is set.
 */

import { CheckCircle, AlertCircle } from 'lucide-react'

interface CredentialStatusProps {
  isConfigured: boolean
  envVarName?: string
}

export function CredentialStatus({ isConfigured, envVarName }: CredentialStatusProps) {
  if (isConfigured) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm font-bold text-brand-green">
        <CheckCircle className="h-4 w-4" />
        Env var set
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-bold text-text-muted">
        <AlertCircle className="h-4 w-4" />
        Not configured
      </div>
      {envVarName && (
        <p className="font-mono text-[11px] text-text-muted">
          Add <span className="text-white">{envVarName}</span> to your env vars
        </p>
      )}
    </div>
  )
}
