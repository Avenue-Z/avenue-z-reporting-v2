// Posts to /api/aeo-outbound/generate and maps every answer to what the hub or editor does next (spec §7a).
import { ACCESS_MESSAGE, BAD_PROJECT, BAD_REQUEST, BAD_RERUN, LOST_CONNECTION } from './messages'
import { failureText } from './failure-text'

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
      // 200 failed: the reason in plain words (its code, else its stored text), and a refresh so the row shows it too.
      return { kind: 'message', text: id ? failureText(str(b.code), str(b.error), id) : str(b.error) ?? '', refresh: true }
    }
    case 400:
      if (b.code === 'bad-range' && str(b.error)) return { kind: 'range', text: str(b.error)! }
      // v1.1 §9: a malformed request has its own message; any other 400 is the project.
      return { kind: 'message', text: b.code === 'bad-request' ? BAD_REQUEST : BAD_PROJECT, refresh: false }
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
