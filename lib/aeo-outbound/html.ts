const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }
/** HTML-escape text and attribute values (the same five characters as aivx renderer.py:15 esc). */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ENT[c])
/** Plotly reads its own tags inside labels (T2 finding), so Peec text in figures loses < and >. */
export const stripTags = (s: string): string => s.replace(/[<>]/g, '')
const BS = String.fromCharCode(92)
/** JSON safe inside an inline <script>: <, >, & and the two line separators become escapes. */
export const jsonForScript = (x: unknown): string =>
  JSON.stringify(x)
    .replace(/</g, BS + 'u003c').replace(/>/g, BS + 'u003e').replace(/&/g, BS + 'u0026')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), BS + 'u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), BS + 'u2029')
