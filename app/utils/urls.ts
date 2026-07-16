export interface ImportedUrl {
  inputUrl: string
  normalizedUrl: string
  domain: string
}

const urlCandidatePattern =
  /(?:(?:https?:\/\/|www\.)[^\s<>"'`]+|(?<![@\w])(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+[a-z]{2,63}(?:\/[^\s<>"'`]*)?)/giu

export function normalizeUrl(input: string): ImportedUrl | null {
  let candidate = trimCandidate(input)
  if (!candidate) return null

  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`
  }

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null
  if (url.username || url.password) return null
  if (!url.hostname) return null

  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase()
  url.hash = ''

  return {
    inputUrl: trimCandidate(input),
    normalizedUrl: url.href,
    domain: url.hostname.replace(/^www\./, ''),
  }
}

export function extractUrls(text: string): ImportedUrl[] {
  let unique = new Map<string, ImportedUrl>()

  for (let match of text.matchAll(urlCandidatePattern)) {
    let normalized = normalizeUrl(match[0])
    if (normalized && !unique.has(normalized.normalizedUrl)) {
      unique.set(normalized.normalizedUrl, normalized)
    }
  }

  return [...unique.values()]
}

function trimCandidate(input: string): string {
  let value = input.trim().replace(/^[<\[({'"]+/, '')

  while (/[>\])},.;!?'":]$/.test(value)) {
    let final = value.at(-1)
    if (final === ')' && count(value, '(') >= count(value, ')')) break
    value = value.slice(0, -1)
  }

  return value
}

function count(value: string, character: string): number {
  return value.split(character).length - 1
}
