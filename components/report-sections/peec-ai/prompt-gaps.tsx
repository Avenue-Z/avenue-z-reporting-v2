import type { PromptGapsResult } from '@/lib/peec/prompt-gaps'
import type { ReportAudience } from './ctx'
import { PromptGapsTable } from './prompt-gaps-table'
import { ClientVisibleSwitch } from './client-visible-switch'

export const PROMPT_GAPS_VIEW_KEY = 'peec-ai:content-impact'
export const PROMPT_GAPS_BLOCK_ID = 'prompt-gaps'

/** Data boundary: prompt text is computed only when this is true (client viewers need the block switched on). */
export function shouldComputePromptGaps({ audience, clientVisible }: { audience: ReportAudience; clientVisible: boolean }): boolean {
  return audience === 'internal' || clientVisible
}

/** Gaps result for the caller, or null when they must not be computed. `compute` is not called when gated off. */
export function gatedPromptGaps(
  input: { audience: ReportAudience; clientVisible: boolean; hasPeecData: boolean },
  compute: () => PromptGapsResult,
): PromptGapsResult | null {
  if (!input.hasPeecData || !shouldComputePromptGaps(input)) return null
  return compute()
}

const ERROR_COPY = {
  incomplete: "Prompt data from Peec came back incomplete, so gaps aren't shown. This usually clears on the next refresh.",
  unavailable: "Prompt data from Peec couldn't be loaded.",
} as const

export function PromptGapsBlock({
  result,
  audience,
  clientVisible,
  canToggle,
  clientSlug,
}: {
  result: PromptGapsResult
  audience: ReportAudience
  clientVisible: boolean
  canToggle: boolean
  clientSlug: string
}) {
  if (audience === 'client' && !clientVisible) return null
  // Clients never see error copy (M9b): an unusable result hides the block for them.
  if (audience === 'client' && !result.ok) return null
  const showChip = audience === 'internal' && !clientVisible

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6" data-export-block="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div data-export-keep-with-next="">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Prompt gaps</h3>
            {showChip && (
              <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-bold text-white/60">Internal</span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Tracked prompts where no owned page is cited, was cited last period but isn&apos;t now, or where our average position fell, compared with the previous period.
          </p>
        </div>
        {canToggle && (
          <ClientVisibleSwitch clientSlug={clientSlug} viewKey={PROMPT_GAPS_VIEW_KEY} blockId={PROMPT_GAPS_BLOCK_ID} checked={clientVisible} />
        )}
      </div>
      {result.ok ? (
        <PromptGapsTable rows={result.rows} />
      ) : (
        <p className="text-xs text-text-muted">{ERROR_COPY[result.reason]}</p>
      )}
    </div>
  )
}
