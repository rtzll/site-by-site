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
    assert.equal(await page.getByRole('link', { name: 'Collection' }).getAttribute('aria-current'), 'page')
    assert.equal(await page.getByRole('link', { name: 'Ranking' }).getAttribute('aria-current'), null)

    let pageText = await page.locator('body').innerText()
    assert.match(pageText, /Untitled collection/)
    assert.doesNotMatch(pageText, /Collection not found/)

    let collectionUrl = page.url()
    let desktopMainWidth = await page.locator('.workspace-main').evaluate(
      (element) => element.getBoundingClientRect().width,
    )
    let desktopHeaderWidth = await page.locator('.workspace-shell .app-header').evaluate(
      (element) => element.getBoundingClientRect().width,
    )
    assert.ok(desktopMainWidth <= 608)
    assert.equal(desktopHeaderWidth, desktopMainWidth)

    let compareLink = page.getByRole('link', { name: 'Compare' })
    assert.equal(await compareLink.getAttribute('rmx-document'), '')
    await compareLink.click()
    await page.locator('[data-comparison]').waitFor()
    assert.doesNotMatch(await page.locator('body').innerText(), /Two available sites are needed/)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(collectionUrl)
    await page.getByRole('heading', { name: 'Untitled collection' }).waitFor()
    let mobileMainWidth = await page.locator('.workspace-main').evaluate(
      (element) => element.getBoundingClientRect().width,
    )
    assert.equal(mobileMainWidth, 366)

    let rankingLink = page.getByRole('link', { name: 'Ranking' })
    assert.equal(await rankingLink.getAttribute('rmx-document'), '')
    await rankingLink.click()
    await page.locator('.ranking-table').waitFor()
    assert.equal(await page.getByRole('link', { name: 'Collection' }).getAttribute('aria-current'), null)
    assert.equal(await page.getByRole('link', { name: 'Ranking' }).getAttribute('aria-current'), 'page')
    assert.equal(
      await page.locator('.comparison-column').first().evaluate((element) => getComputedStyle(element).display),
      'none',
    )
    assert.equal(
      await page.locator('.site-domain').first().evaluate((element) => getComputedStyle(element).fontSize),
      '14px',
    )
    let rankingWidth = await page.locator('.workspace-main').evaluate(
      (element) => element.getBoundingClientRect().width,
    )
    assert.equal(rankingWidth, mobileMainWidth)
  })

  it('starts and reopens the bundled demo collection', { timeout: 15_000 }, async (t) => {
    let server = await createTestServer(createAppRouter().fetch)
    let page = await t.serve(server)

    await page.goto('/')
    let startDemo = page.getByRole('button', { name: 'Open demo' })
    await startDemo.click()
    await page.waitForURL(/\/collections\/[^/]+\/compare$/)
    await page.locator('[data-comparison]').waitFor()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    let mobileHomeWidth = await page.locator('.home-main').evaluate(
      (element) => element.getBoundingClientRect().width,
    )
    assert.equal(mobileHomeWidth, 366)
    let demoLink = page.getByRole('link', { name: /Personal sites demo/ })
    assert.match(await demoLink.innerText(), /34 sites/)
    assert.equal(await demoLink.count(), 1)

    await page.getByRole('button', { name: 'Open demo' }).click()
    await page.waitForURL(/\/collections\/[^/]+\/compare$/)
    await page.goto('/')
    assert.equal(await page.getByRole('link', { name: /Personal sites demo/ }).count(), 1)
  })
})
