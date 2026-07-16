import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { parseBookmarkHtml } from './bookmarks.ts'

describe('bookmark HTML', () => {
  it('discovers nested folders and includes child links in parent counts', () => {
    let folders = parseBookmarkHtml(`
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
        <DT><H3>Website inspiration</H3>
        <DL><p>
          <DT><A HREF="https://one.test">One</A>
          <DT><H3>Typography &amp; type</H3>
          <DL><p><DT><A HREF="https://type.test">Type</A></DL><p>
        </DL><p>
        <DT><H3>Empty folder</H3><DL><p></DL><p>
      </DL><p>
    `)

    assert.deepEqual(
      folders.map((folder) => [folder.path, folder.urls.length]),
      [
        ['Website inspiration', 2],
        ['Website inspiration / Typography & type', 1],
        ['Empty folder', 0],
      ],
    )
  })
})
