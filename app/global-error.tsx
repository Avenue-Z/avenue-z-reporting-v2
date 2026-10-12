'use client'

// The crash screen, kept exactly as next 16.1.6 drew it (next/dist/client/components/builtin/global-error.js
// at 16.1.6). next 16.2 redesigned its default, and this app had no global-error of its own, so the upgrade
// would have changed what every client sees when a page fails outright. It is what an error that escapes the
// app's own boundaries shows (report sections have their own, ReportErrorBoundary). Two framework-level
// fallbacks cannot be kept this way, because Next always uses its built-in page for them: the static 500.html
// and the router's last-resort boundary for when the framework itself fails. Those show 16.2's design from
// this upgrade on. 16.1.6's default also rendered
// HandleISRError, which renders nothing outside static generation; the framework's error boundary already
// renders or calls it itself in both versions, so it is not repeated here. global-error.test.tsx pins the
// markup to 16.1.6's own output.
const styles = {
  error: {
    // https://github.com/sindresorhus/modern-normalize/blob/main/modern-normalize.css#L38-L52
    fontFamily: 'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: '100vh',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '28px',
    margin: '0 8px',
  },
} as const

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const digest = error?.digest
  return (
    <html id="__next_error__">
      <head />
      <body>
        <div style={styles.error}>
          <div>
            <h2 style={styles.text}>
              {'Application error: a '}{digest ? 'server' : 'client'}{'-side exception has occurred while loading '}{window.location.hostname}{' (see the'}{' '}{digest ? 'server logs' : 'browser console'}{' for more information).'}
            </h2>
            {digest ? <p style={styles.text}>{`Digest: ${digest}`}</p> : null}
          </div>
        </div>
      </body>
    </html>
  )
}
