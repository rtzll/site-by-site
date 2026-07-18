import * as assert from 'remix/assert'
import { createTestServer } from 'remix/node-fetch-server/test'
import { describe, it } from 'remix/test'

import { createAppRouter } from '../router.ts'

describe('saved collection navigation', () => {
  it('opens a locally stored collection without a browser refresh', { timeout: 15_000 }, async (t) => {
    let server = await createTestServer(createAppRouter().fetch)
    let page = await t.serve(server)

    await page.goto('/')
    let startButton = page.getByRole('button', { name: 'Start comparing' })
    await page.waitForFunction(() => {
      let button = document.querySelector<HTMLButtonElement>('.home-submit')
      return button?.disabled === false
    })
    await page.getByLabel('Links').fill('https://example.com\nhttps://example.org')
    await startButton.click()
    await page.waitForURL(/\/collections\/[^/]+\/compare$/)

    await page.goto('/')
    let collectionLink = page.getByRole('link', { name: 'Untitled collection' })
    assert.equal(await collectionLink.getAttribute('rmx-document'), '')
    await collectionLink.click()
    await page.getByRole('heading', { name: 'Untitled collection' }).waitFor()

    let pageText = await page.locator('body').innerText()
    assert.match(pageText, /Untitled collection/)
    assert.doesNotMatch(pageText, /Collection not found/)
  })
})
