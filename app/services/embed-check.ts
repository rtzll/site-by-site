export type EmbedStatus =
  | 'allowed'
  | 'blocked'
  | 'conditional'
  | 'unverified'
  | 'runtime_failed'

export interface EmbedClassification {
  status: Exclude<EmbedStatus, 'runtime_failed' | 'unverified'>
  reason: string
}

export interface EmbedCheckResult {
  status: EmbedStatus
  reason: string
  finalUrl: string
  httpStatus: number | null
  title: string | null
}

const browserUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

export function classifyEmbedHeaders(headers: Headers): EmbedClassification {
  let csp = headers.get('Content-Security-Policy')
  let frameAncestors = csp
    ?.split(';')
    .map((directive) => directive.trim())
    .find((directive) => /^frame-ancestors(?:\s|$)/i.test(directive))

  if (frameAncestors) {
    let sources = frameAncestors
      .replace(/^frame-ancestors\s*/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((source) => source.toLowerCase())

    if (sources.includes("'none'")) {
      return { status: 'blocked', reason: "Content-Security-Policy sets frame-ancestors 'none'." }
    }
    if (sources.length === 1 && sources[0] === "'self'") {
      return { status: 'blocked', reason: 'Content-Security-Policy only permits same-origin frames.' }
    }
    if (sources.includes('*')) {
      return { status: 'allowed', reason: 'Content-Security-Policy permits framing from any origin.' }
    }
    return {
      status: 'conditional',
      reason: 'Content-Security-Policy permits a limited set of framing origins.',
    }
  }

  let xFrameOptions = headers.get('X-Frame-Options')?.trim().toUpperCase()
  if (xFrameOptions === 'DENY') {
    return { status: 'blocked', reason: 'X-Frame-Options is DENY.' }
  }
  if (xFrameOptions === 'SAMEORIGIN') {
    return { status: 'blocked', reason: 'X-Frame-Options only permits same-origin frames.' }
  }
  if (xFrameOptions?.startsWith('ALLOW-FROM')) {
    return { status: 'conditional', reason: 'X-Frame-Options names a limited framing origin.' }
  }

  return { status: 'allowed', reason: 'No framing restriction was declared in response headers.' }
}

export async function checkEmbeddability(
  inputUrl: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<EmbedCheckResult> {
  let fetchImplementation = options.fetch ?? fetch
  let controller = new AbortController()
  let timeout = setTimeout(() => controller.abort(new Error('Request timed out.')), options.timeoutMs ?? 8_000)

  try {
    let response = await fetchImplementation(inputUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': browserUserAgent,
      },
    })

    let contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
    let title = contentType.includes('html') ? await readTitle(response) : null

    if (!response.ok) {
      return {
        status: 'blocked',
        reason: `The server returned HTTP ${response.status}.`,
        finalUrl: response.url || inputUrl,
        httpStatus: response.status,
        title,
      }
    }

    if (contentType && !contentType.includes('html')) {
      return {
        status: 'blocked',
        reason: `The response is ${contentType.split(';')[0]}, not an HTML page.`,
        finalUrl: response.url || inputUrl,
        httpStatus: response.status,
        title: null,
      }
    }

    let classification = classifyEmbedHeaders(response.headers)
    return {
      ...classification,
      finalUrl: response.url || inputUrl,
      httpStatus: response.status,
      title,
    }
  } catch (error) {
    let reason = error instanceof Error ? error.message : 'The website could not be reached.'
    return { status: 'unverified', reason, finalUrl: inputUrl, httpStatus: null, title: null }
  } finally {
    clearTimeout(timeout)
  }
}

async function readTitle(response: Response): Promise<string | null> {
  if (!response.body) return null

  let reader = response.body.getReader()
  let decoder = new TextDecoder()
  let html = ''

  try {
    while (html.length < 65_536) {
      let chunk = await reader.read()
      if (chunk.done) break
      html += decoder.decode(chunk.value, { stream: true })
      if (/<\/title\s*>/i.test(html)) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  let match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)
  return match?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 240) || null
}
