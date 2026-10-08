import { expect, test, vi } from 'vitest'
import { ExportNotReadyError, ExportRenderError, renderPdf, type BrowserLike, type PageLike } from './render-pdf'

const PDF = new Uint8Array([37, 80, 68, 70])
const timeout = () => Object.assign(new Error('Waiting failed: 45000ms exceeded'), { name: 'TimeoutError' })

function fakes(over: Partial<PageLike> = {}, landed = 'https://app.example/export/renaissance/organic-social?dateRange=x') {
  const page: PageLike = {
    setViewport: vi.fn(async () => {}),
    setExtraHTTPHeaders: vi.fn(async () => {}),
    goto: vi.fn(async () => ({ status: () => 200 })),
    url: vi.fn(() => landed),
    waitForFunction: vi.fn(async () => true),
    emulateMediaType: vi.fn(async () => {}),
    pdf: vi.fn(async () => PDF),
    ...over,
  }
  const browser: BrowserLike = { setCookie: vi.fn(async () => {}), newPage: vi.fn(async () => page), close: vi.fn(async () => {}) }
  return { page, browser, launch: vi.fn(async () => browser) }
}
const opts = { url: 'https://app.example/export/renaissance/organic-social?dateRange=x', cookies: [{ name: '__Secure-authjs.session-token', value: 'v' }] }

test('renders the export page at the content width, once ready, with screen media, as letter landscape', async () => {
  const { page, browser, launch } = fakes()
  expect(await renderPdf(opts, { launch })).toBe(PDF)
  expect(browser.setCookie).toHaveBeenCalledWith({ name: '__Secure-authjs.session-token', value: 'v', domain: 'app.example', path: '/', httpOnly: true, secure: true })
  expect(page.setViewport).toHaveBeenCalledWith({ width: 979, height: 739 })
  expect(page.waitForFunction).toHaveBeenCalledWith('window.__exportReady === true', expect.objectContaining({ timeout: expect.any(Number) }))
  expect(page.emulateMediaType).toHaveBeenCalledWith('screen')
  expect(page.pdf).toHaveBeenCalledWith({ width: '11in', height: '8.5in', margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' }, printBackground: true, timeout: expect.any(Number) })
  expect(browser.close).toHaveBeenCalled()
})

test('a page never ready is a not-ready error, with no PDF taken and the browser closed', async () => {
  const { page, browser, launch } = fakes({ waitForFunction: vi.fn(async () => { throw timeout() }) })
  await expect(renderPdf(opts, { launch })).rejects.toBeInstanceOf(ExportNotReadyError)
  expect(page.pdf).not.toHaveBeenCalled()
  expect(browser.close).toHaveBeenCalled()
})

test('a page still streaming when the budget runs out is also not ready', async () => {
  const { launch } = fakes({ goto: vi.fn(async () => { throw timeout() }) })
  await expect(renderPdf(opts, { launch })).rejects.toBeInstanceOf(ExportNotReadyError)
})

test.each(['/login', '/unauthorized'])('landing on %s is an auth failure', async (path) => {
  const { page, launch } = fakes({}, `https://app.example${path}`)
  await expect(renderPdf(opts, { launch })).rejects.toMatchObject({ step: 'auth' })
  expect(page.pdf).not.toHaveBeenCalled()
})

test('an error status from the export page is a navigation failure', async () => {
  const { launch } = fakes({ goto: vi.fn(async () => ({ status: () => 500 })) })
  await expect(renderPdf(opts, { launch })).rejects.toMatchObject({ step: 'navigate' })
})

test('a browser that will not start is a launch failure', async () => {
  await expect(renderPdf(opts, { launch: vi.fn(async () => { throw new Error('spawn ENOENT') }) })).rejects.toMatchObject({ step: 'launch' })
})

test('a failure printing is a pdf failure, and the browser is still closed', async () => {
  const { browser, launch } = fakes({ pdf: vi.fn(async () => { throw new Error('Printing failed') }) })
  const err = await renderPdf(opts, { launch }).catch((e) => e)
  expect(err).toBeInstanceOf(ExportRenderError)
  expect(err.step).toBe('pdf')
  expect(browser.close).toHaveBeenCalled()
})

// Launch, navigation and the ready wait share ONE budget, so a slow cold start cannot push the PDF step past the
// route's maxDuration (review of #332): navigation gets what is left, not the whole budget.
test('time spent launching comes out of the navigation budget', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
  const { page, browser } = fakes()
  const launch = vi.fn(async () => { vi.setSystemTime(new Date('2026-10-06T12:00:10Z')); return browser })
  await renderPdf({ ...opts, readyTimeoutMs: 40_000 }, { launch })
  vi.useRealTimers()
  expect(page.goto).toHaveBeenCalledWith(opts.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
})

test('the default budget leaves the PDF step room inside the 60s function limit', async () => {
  const { page, launch } = fakes()
  await renderPdf(opts, { launch })
  const { timeout } = vi.mocked(page.goto).mock.calls[0][1]
  expect(timeout).toBeLessThanOrEqual(40_000)
})

// Dash's image service negotiates on Accept: Chrome's (which lists image/webp) gets WebP even for format=jpeg, and
// Chromium stores WebP losslessly in a PDF. With Accept */* it serves the JPEG, which is embedded as is.
test('the server browser asks for any type, so print images arrive as JPEG', async () => {
  const { page, launch } = fakes()
  await renderPdf(opts, { launch })
  expect(page.setExtraHTTPHeaders).toHaveBeenCalledWith({ accept: '*/*' })
  expect(vi.mocked(page.setExtraHTTPHeaders).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(page.goto).mock.invocationCallOrder[0])
})

// page.pdf() defaults to puppeteer's own 30 s timeout. After a 40 s budget that is 70 s against maxDuration 60, and
// a platform kill skips the log line and the finally that closes Chromium (Thomas, #332 render-pdf.ts:96). It gets
// its own deadline against the function's limit, not what is left of the ready budget, so a page ready late still prints.
test('printing gets its own deadline inside the 60 s function limit, even when the page was ready late', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
  const { page, launch } = fakes({ waitForFunction: vi.fn(async () => { vi.setSystemTime(new Date('2026-10-07T12:00:38Z')); return true }) })
  await renderPdf(opts, { launch })
  vi.useRealTimers()
  expect(vi.mocked(page.pdf).mock.calls[0][0].timeout).toBe(17_000) // 55 s deadline − 38 s already spent
})
