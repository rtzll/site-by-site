export interface BookmarkFolder {
  name: string
  path: string
  urls: string[]
}

const tokenPattern = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<dl\b[^>]*>|<\/dl>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi

export function parseBookmarkHtml(html: string): BookmarkFolder[] {
  let stack: string[] = []
  let dlStack: boolean[] = []
  let pendingFolder: string | null = null
  let folders = new Map<string, { name: string; urls: Set<string> }>()

  for (let match of html.matchAll(tokenPattern)) {
    let token = match[0].toLowerCase()

    if (token.startsWith('<h3')) {
      pendingFolder = cleanText(match[1] ?? '') || 'Untitled folder'
      continue
    }

    if (token.startsWith('<dl')) {
      let pushedFolder = pendingFolder !== null
      dlStack.push(pushedFolder)
      if (pendingFolder) {
        stack.push(pendingFolder)
        ensureFolder(folders, stack)
      }
      pendingFolder = null
      continue
    }

    if (token.startsWith('</dl')) {
      if (dlStack.pop()) stack.pop()
      pendingFolder = null
      continue
    }

    if (token.startsWith('<a')) {
      let href = readAttribute(match[2] ?? '', 'href')
      if (!href) continue

      if (stack.length === 0) {
        let fallback = ['Imported bookmarks']
        ensureFolder(folders, fallback).urls.add(decodeEntities(href))
        continue
      }

      for (let depth = 1; depth <= stack.length; depth++) {
        ensureFolder(folders, stack.slice(0, depth)).urls.add(decodeEntities(href))
      }
    }
  }

  return [...folders.entries()].map(([path, folder]) => ({
    name: folder.name,
    path,
    urls: [...folder.urls],
  }))
}

function ensureFolder(folders: Map<string, { name: string; urls: Set<string> }>, stack: string[]) {
  let path = stack.join(' / ')
  let folder = folders.get(path)
  if (!folder) {
    folder = { name: stack.at(-1) ?? 'Imported bookmarks', urls: new Set() }
    folders.set(path, folder)
  }
  return folder
}

function readAttribute(attributes: string, name: string): string | null {
  let match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  )
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16))
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10))
    return named[body.toLowerCase()] ?? entity
  })
}
