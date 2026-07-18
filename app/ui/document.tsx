import { css, type Handle, type RemixNode } from 'remix/ui'

import { clientEntryHref } from '../client-entry.ts'

export interface DocumentProps {
  children?: RemixNode
  title?: string
  bodyClass?: string
}

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, title = 'Site by Site', bodyClass } = handle.props
    let darkCanvas = bodyClass === 'comparison-body' || bodyClass === 'home-body' || bodyClass === 'workspace-body'

    return (
      <html lang="en" mix={htmlStyle}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content={darkCanvas ? '#171714' : '#f4f1e9'} />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
          />
          <link rel="stylesheet" href="/styles.css" />
          <title>{title}</title>
        </head>
        <body class={bodyClass} mix={bodyStyle}>
          {children}
          <script type="module" src={clientEntryHref}></script>
        </body>
      </html>
    )
  }
}

const htmlStyle = css({
  minWidth: '320px',
  background: '#f4f1e9',
  WebkitFontSmoothing: 'antialiased',
  '&:has(body.home-body), &:has(body.workspace-body), &:has(body.comparison-body)': { background: '#171714' },
})

const bodyStyle = css({
  margin: 0,
  minWidth: '320px',
  minHeight: '100dvh',
  color: '#1d1d1b',
  background: '#f4f1e9',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11", "ss01", "ss03"',
  fontSynthesis: 'none',
  '&.home-body': { color: 'white', background: '#171714', colorScheme: 'dark' },
  '&.workspace-body': { color: 'white', background: '#171714', colorScheme: 'dark' },
  '& *, & *::before, & *::after': { boxSizing: 'border-box' },
  '& button, & a': { WebkitTapHighlightColor: 'transparent' },
})
