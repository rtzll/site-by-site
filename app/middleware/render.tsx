import type { Router } from 'remix/router'
import { renderWith } from 'remix/middleware/render'
import { createHtmlResponse } from 'remix/response/html'
import type { RemixNode } from 'remix/ui'
import { renderToStream } from 'remix/ui/server'

import { SiteBySiteEntryId } from '../assets/site-by-site.tsx'
import { clientEntryHref } from '../client-entry.ts'

export function render() {
  return renderWith(
    ({ request, router }) =>
      function renderNode(node: RemixNode, init?: ResponseInit) {
        let stream = renderToStream(node, {
          frameSrc: request.url,
          signal: request.signal,
          resolveFrame: (src) => resolveFrame(router, request, src),
          async resolveClientEntry(entryId) {
            if (entryId !== SiteBySiteEntryId) throw new Error(`Unknown client entry: ${entryId}`)
            return { href: clientEntryHref, exportName: SiteBySiteEntryId }
          },
        })

        return createHtmlResponse(stream, init)
      },
  )
}

async function resolveFrame(router: Router, request: Request, src: string) {
  let url = new URL(src, request.url)
  let headers = new Headers({ Accept: 'text/html' })
  let cookie = request.headers.get('Cookie')
  if (cookie) headers.set('Cookie', cookie)

  let response = await router.fetch(
    new Request(url, { method: 'GET', headers, signal: request.signal }),
  )

  if (!response.ok) return `<pre>Frame error: ${response.status}</pre>`
  return response.body ?? (await response.text())
}
