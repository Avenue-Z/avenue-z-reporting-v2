// Posts to /api/aeo-outbound/generate and maps every answer to what the hub or editor does next (spec §7a).
import { ACCESS_MESSAGE, BAD_PROJECT, BAD_RERUN, LOST_CONNECTION } from './messages'

export type GenerateBody = { projectId: string; rerunOf?: string; start?: string; end?: string }
export type GenerateOutcome =
  | { kind: 'open'; id: string }
  | { kind: 'message'; text: string; refresh: boolean }
  | { kind: 'range'; text: string }

const lost: GenerateOutcome = { kind: 'message', text: LOST_CONNECTION, refresh: true }
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export async function requestGenerate(body: GenerateBody): Promise<GenerateOutcome> {
  let res: Response
  let b: Record<string, unknown>
  try {
    res = await fetch('/api/aeo-outbound/generate', { method: 'POST', body: JSON.stringify(body) })
    const parsed: unknown = await res.json()
    b = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return lost
  }
  switch (res.status) {
    case 200: {
      const id = str(b.id)
      if (b.status === 'draft' && id) return { kind: 'open', id }
      // 200 failed: the reason, and a refresh so the failed row shows it too.
      return { kind: 'message', text: str(b.error) ?? '', refresh: true }
    }
    case 400:
      return b.code === 'bad-range' && str(b.error) ? { kind: 'range', text: str(b.error)! } : { kind: 'message', text: BAD_PROJECT, refresh: false }
    case 403:
      return { kind: 'message', text: ACCESS_MESSAGE, refresh: false }
    case 404:
      return { kind: 'message', text: BAD_RERUN, refresh: false }
    case 409: {
      const id = str(b.id)
      return id ? { kind: 'open', id } : { kind: 'message', text: '', refresh: true }
    }
    case 500:
    case 502:
      return str(b.error) ? { kind: 'message', text: str(b.error)!, refresh: false } : lost
    default:
      return lost
  }
}
