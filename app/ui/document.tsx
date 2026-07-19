import { css, type Handle, type RemixNode } from 'remix/ui'

import { clientEntryHref } from '../client-entry.ts'

const stylesHref = process.env.NODE_ENV === 'development'
  ? `/styles.css?v=${Date.now()}`
  : '/styles.css'

export interface DocumentProps {
  children?: RemixNode
  title?: string
  bodyClass?: string
}

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, title = 'Site by Site', bodyClass } = handle.props
    let darkCanvas = bodyClass === 'comparison-body'

    return (
      <html lang="en" mix={htmlStyle}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content={darkCanvas ? '#111111' : '#ffffff'} />
          <link rel="preconnect" href="https://rsms.me" />
          <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
          <link rel="stylesheet" href={stylesHref} />
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
  background: '#fff',
  WebkitFontSmoothing: 'antialiased',
  '&:has(body.comparison-body)': { background: '#111' },
})

const bodyStyle = css({
  margin: 0,
  minWidth: '320px',
  minHeight: '100dvh',
  color: '#171717',
  background: '#fff',
  fontFamily: 'InterVariable, Inter, ui-sans-serif, system-ui, sans-serif',
  fontOpticalSizing: 'auto',
  fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11", "ss01", "ss03"',
  fontSynthesis: 'none',
  '&.home-body, &.workspace-body': { color: '#171717', background: '#fff', colorScheme: 'light' },
  '&.comparison-body': { color: 'white', background: '#111', colorScheme: 'dark' },
  '& *, & *::before, & *::after': { boxSizing: 'border-box' },
  '& button, & a': { WebkitTapHighlightColor: 'transparent' },
})
