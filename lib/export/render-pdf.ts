// Server-side PDF rendering for the export (spec docs/superpowers/specs/2026-10-06-organic-social-pdf-export-v2-design.md §8).
// Opens the export page in headless Chromium as the requester, waits until the page reports itself
// fully loaded, and prints it at US Letter landscape. Never returns a partial PDF: a page that is not
// ready in time is an ExportNotReadyError, and nothing is printed.

/** Content box of the page: 11 × 8.5 in less 0.4 in margins, at 96 px/in. */
export const CONTENT_WIDTH = 979
export const CONTENT_HEIGHT = 739
const MARGIN = '0.4in'
/** One budget for launch + navigation + the ready wait. The route's maxDuration is 60 s; 40 s here leaves room
 *  for auth before and page.pdf() after, so a slow but successful render is never cut off by the platform. */
const READY_TIMEOUT_MS = 40_000
/** page.pdf()'s own deadline, measured from the start like the budget above but against the function's 60 s
 *  (less headroom for the response). Not what is left of the ready budget: a page ready at 38 s still gets 17 s to
 *  print. Without it puppeteer's default 30 s applied, a worst case of 70 s, and a platform kill skips the log
 *  line and the browser's close. */
const PDF_DEADLINE_MS = 55_000
/** How long browser.close() may take before the process is killed: a close that hangs must not hold the function
 *  past its 60 s (55 s + this leaves room for the response). */
const CLOSE_TIMEOUT_MS = 3_000

export type ExportStep = 'launch' | 'setup' | 'navigate' | 'auth' | 'pdf'

/** The page did not finish loading within the budget: report "still loading", print nothing. `step` says which wait
 *  ran out: the streamed navigation, or the page's own ready signal after it. */
export class ExportNotReadyError extends Error {
  constructor(readonly step: 'navigate' | 'ready') { super(`export page not ready in time (${step})`); this.name = 'ExportNotReadyError' }
}

/** A failure at a named step. The message never carries the URL (it holds the client and range). */
export class ExportRenderError extends Error {
  constructor(readonly step: ExportStep, cause?: unknown) {
    super(`export failed at ${step}`, cause === undefined ? undefined : { cause })
    this.name = 'ExportRenderError'
  }
}

// The slice of puppeteer this module uses, so tests can drive it with fakes.
export interface PageLike {
  setViewport(v: { width: number; height: number }): Promise<void>
  setExtraHTTPHeaders(h: Record<string, string>): Promise<void>
  goto(url: string, o: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<{ status(): number } | null>
  url(): string
  waitForFunction(fn: string, o: { timeout: number; polling: number }): Promise<unknown>
  emulateMediaType(type: 'screen'): Promise<void>
  pdf(o: { width: string; height: string; margin: Record<'top' | 'right' | 'bottom' | 'left', string>; printBackground: boolean; timeout: number }): Promise<Uint8Array>
}
export interface BrowserLike {
  setCookie(...c: { name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean }[]): Promise<void>
  newPage(): Promise<PageLike>
  close(): Promise<void>
  /** The browser's process, to kill when close() hangs (puppeteer's Browser.process()). */
  process(): { kill(signal?: NodeJS.Signals): boolean } | null
}

const isTimeout = (e: unknown) => e instanceof Error && e.name === 'TimeoutError'

/** Close the browser, or kill its process if closing takes longer than CLOSE_TIMEOUT_MS. Never throws. */
async function closeBrowser(browser: BrowserLike): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const closed = await Promise.race([
    browser.close().then(() => true, () => false),
    new Promise<false>((r) => { timer = setTimeout(() => r(false), CLOSE_TIMEOUT_MS) }),
  ])
  clearTimeout(timer)
  if (!closed) { try { browser.process()?.kill('SIGKILL') } catch { /* already gone */ } }
}

export async function renderPdf(
  /** `startedAt`: when the request started (the route's clock), so time spent before rendering (auth, the client
   *  lookup) comes out of the same budgets. Defaults to now. */
  opts: { url: string; cookies: { name: string; value: string }[]; readyTimeoutMs?: number; startedAt?: number },
  deps: { launch: () => Promise<BrowserLike> } = { launch: launchChromium },
): Promise<Uint8Array> {
  const budget = opts.readyTimeoutMs ?? READY_TIMEOUT_MS
  const started = opts.startedAt ?? Date.now()
  let browser: BrowserLike
  try {
    browser = await deps.launch()
  } catch (e) {
    throw e instanceof ExportRenderError ? e : new ExportRenderError('launch', e)
  }
  try {
    const target = new URL(opts.url)
    let page: PageLike
    try {
      if (opts.cookies.length > 0) {
        await browser.setCookie(...opts.cookies.map((c) => ({
          name: c.name, value: c.value, domain: target.hostname, path: '/', httpOnly: true, secure: target.protocol === 'https:',
        })))
      }
      page = await browser.newPage()
      await page.setViewport({ width: CONTENT_WIDTH, height: CONTENT_HEIGHT })
      // Dash's image service negotiates on Accept: Chrome's own (it lists image/webp) gets WebP even for the
      // format=jpeg print URLs (lib/export/print-image.ts), and Chromium stores WebP losslessly in a PDF. With */* it
      // serves the JPEG, which the PDF embeds as is. Harmless for the page's other requests.
      await page.setExtraHTTPHeaders({ accept: '*/*' })
    } catch (e) {
      throw new ExportRenderError('setup', e)
    }

    // The export page streams: navigation completes only once every part has resolved on the server,
    // so running out of time here is the same "still loading" as the ready wait below.
    const left = () => Math.max(1_000, budget - (Date.now() - started))
    let res: { status(): number } | null
    try {
      res = await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: left() })
    } catch (e) {
      throw isTimeout(e) ? new ExportNotReadyError('navigate') : new ExportRenderError('navigate', e)
    }
    const landed = new URL(page.url()).pathname
    if (landed.startsWith('/login') || landed.startsWith('/unauthorized')) throw new ExportRenderError('auth')
    if (res && res.status() >= 400) throw new ExportRenderError('navigate')

    try {
      await page.waitForFunction('window.__exportReady === true', { timeout: left(), polling: 250 })
    } catch (e) {
      throw isTimeout(e) ? new ExportNotReadyError('ready') : new ExportRenderError('navigate', e)
    }

    // Print what the page lays out on screen at the content width: the export page owns its styling,
    // and the app's global @media print rules (made for printing the live page) must not apply.
    try {
      await page.emulateMediaType('screen')
      return await page.pdf({
        width: '11in', height: '8.5in', margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }, printBackground: true,
        timeout: Math.max(1_000, PDF_DEADLINE_MS - (Date.now() - started)),
      })
    } catch (e) {
      throw new ExportRenderError('pdf', e)
    }
  } finally {
    await closeBrowser(browser)
  }
}

/** Chromium for this environment: the serverless build on Vercel, a local Chrome elsewhere. */
export async function launchChromium(): Promise<BrowserLike> {
  const { default: puppeteer } = await import('puppeteer-core')
  if (process.env.VERCEL) {
    const { default: chromium } = await import('@sparticuz/chromium')
    // As @sparticuz/chromium's README: its args through puppeteer's defaults, and the headless shell build.
    const browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    })
    return browser as unknown as BrowserLike
  }
  const executablePath = process.env.CHROME_EXECUTABLE_PATH
  if (!executablePath) throw new ExportRenderError('launch', new Error('CHROME_EXECUTABLE_PATH is not set (see .env.example)'))
  const browser = await puppeteer.launch({ executablePath, headless: true })
  return browser as unknown as BrowserLike
}
