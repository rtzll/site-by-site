import * as assert from 'remix/assert'
import { createTestServer } from 'remix/node-fetch-server/test'
import { describe, it } from 'remix/test'

import { createAppRouter } from '../router.ts'

describe('saved collection navigation', () => {
  it('opens a locally stored collection without a browser refresh', { timeout: 15_000 }, async (t) => {
    let server = await createTestServer(createAppRouter().fetch)
    let page = await t.serve(server)

    await page.goto('/')
    assert.equal(
      await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(244, 241, 233)',
    )
    assert.equal(
      await page.locator('body').evaluate((element) => getComputedStyle(element).colorScheme),
      'light',
    )
    let startButton = page.getByRole('button', { name: 'Start comparing' })
    await page.waitForFunction(() => {
      let button = document.querySelector<HTMLButtonElement>('.home-submit')
      return button?.disabled === false
    })
    assert.equal(
      await page.locator('.home-submit').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgba(10, 10, 10, 0.62)',
    )
    assert.equal(
      await page.locator('.home-submit').evaluate((element) => getComputedStyle(element).boxShadow),
      'none',
    )
    await page.getByLabel('Links').fill('https://example.com\nhttps://example.org')
    await startButton.click()
    await page.waitForURL(/\/collections\/[^/]+\/compare$/)

    await page.goto('/')
    let collectionLink = page.getByRole('link', { name: 'Untitled collection' })
    assert.equal(await collectionLink.getAttribute('rmx-document'), '')
    await collectionLink.click()
    await page.getByRole('heading', { name: 'Untitled collection' }).waitFor()
    assert.equal(
      await page.locator('.header-menu').evaluate((element) => getComputedStyle(element).display),
      'none',
    )
    assert.equal(await page.getByRole('link', { name: 'Collection' }).getAttribute('aria-current'), 'page')
    assert.equal(await page.getByRole('link', { name: 'Ranking' }).getAttribute('aria-current'), null)
    assert.equal(
      await page.locator('.workspace-controls').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgba(0, 0, 0, 0)',
    )
    assert.equal(
      await page.getByRole('link', { name: 'Compare' }).evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
      'rgba(10, 10, 10, 0.62)',
    )
    assert.equal(await page.getByRole('button', { name: 'Download backup' }).count(), 0)

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
    let comparisonUrl = page.url()
    assert.equal(
      await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(17, 17, 17)',
    )
    assert.equal(
      await page.locator('body').evaluate((element) => getComputedStyle(element).colorScheme),
      'dark',
    )
    assert.doesNotMatch(await page.locator('body').innerText(), /Two available sites are needed/)

    let comparisonContext = page.locator('.comparison-context')
    assert.equal(await comparisonContext.getAttribute('href'), new URL(collectionUrl).pathname)
    assert.equal(await comparisonContext.getAttribute('rmx-document'), '')
    assert.match(await comparisonContext.innerText(), /Untitled collection\s+0 comparisons/)
    let comparisonStage = page.locator('[data-comparison]')
    let divider = page.locator('[data-divider]')
    assert.equal(await divider.evaluate((element) => element.tagName), 'DIV')
    assert.equal(await divider.getAttribute('tabindex'), null)
    assert.equal(await comparisonStage.getAttribute('tabindex'), '-1')
    await divider.click()
    await page.waitForFunction(
      () => document.activeElement?.hasAttribute('data-comparison') === true,
    )

    let originalLeftDomain = await page.locator('.site-status-left a').innerText()
    let originalRightDomain = await page.locator('.site-status-right a').innerText()
    await page.keyboard.press('ArrowLeft')
    let undoButton = page.getByRole('button', { name: 'Undo [u]' })
    await undoButton.waitFor()
    assert.match(await page.locator('.comparison-hint').innerText(), /Choice saved/)
    assert.match(await comparisonContext.innerText(), /1 comparison/)
    await undoButton.waitFor({ state: 'hidden' })
    await page.getByText('Drag the divider to inspect both sites', { exact: true }).waitFor()
    await page.keyboard.press('u')
    await page.getByText('Last action undone', { exact: true }).waitFor()
    assert.match(await comparisonContext.innerText(), /0 comparisons/)
    assert.equal(await page.locator('.site-status-left a').innerText(), originalLeftDomain)
    assert.equal(await page.locator('.site-status-right a').innerText(), originalRightDomain)

    await page.locator('.site-status-left button').click()
    await page.getByRole('heading', { name: 'Two available sites are needed' }).waitFor()
    let emptyStateUndo = page.getByRole('button', { name: 'Undo last action' })
    await emptyStateUndo.waitFor()
    await emptyStateUndo.click()
    await page.locator('[data-comparison]').waitFor()
    assert.equal(await page.locator('.site-status-left a').innerText(), originalLeftDomain)
    assert.equal(await page.locator('.site-status-right a').innerText(), originalRightDomain)

    await page.setViewportSize({ width: 639, height: 844 })
    await page.goto(comparisonUrl)
    await page.getByRole('heading', { name: 'Comparison needs a wider window' }).waitFor()
    assert.equal(await page.locator('[data-comparison]').count(), 0)
    assert.equal(await page.locator('iframe').count(), 0)
    assert.match(await page.locator('.comparison-width-state').innerText(), /at least 640 pixels wide/)
    await page.setViewportSize({ width: 640, height: 844 })
    await page.locator('[data-comparison]').waitFor()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(collectionUrl)
    await page.getByRole('heading', { name: 'Untitled collection' }).waitFor()
    let mobileMainWidth = await page.locator('.workspace-main').evaluate(
      (element) => element.getBoundingClientRect().width,
    )
    assert.equal(mobileMainWidth, 366)
    assert.match(await page.locator('.workspace-stats').innerText(), /Comparisons\s+0/)

    let mobileMenu = page.locator('.header-menu summary')
    assert.equal(
      await mobileMenu.evaluate((element) => element.getBoundingClientRect().height),
      48,
    )
    await mobileMenu.click()
    let rankingLink = page.getByRole('link', { name: 'Ranking' })
    assert.equal(await rankingLink.getAttribute('rmx-document'), '')
    await rankingLink.click()
    let rankingUrl = page.url()
    await page.getByRole('heading', { name: 'No ranking yet' }).waitFor()
    assert.equal(await page.locator('.ranking-table').count(), 0)
    await page.locator('.header-menu summary').click()
    assert.equal(await page.getByRole('link', { name: 'Collection' }).getAttribute('aria-current'), null)
    assert.equal(await page.getByRole('link', { name: 'Ranking' }).getAttribute('aria-current'), 'page')
    let firstComparisonLink = page.getByRole('link', { name: 'Start comparing' })
    assert.equal(await firstComparisonLink.getAttribute('rmx-document'), '')
    await page.setViewportSize({ width: 640, height: 844 })
    await firstComparisonLink.click()
    await page.locator('[data-comparison]').waitFor()
    await page.keyboard.press('ArrowLeft')
    await page.getByText('Choice saved', { exact: true }).waitFor()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(rankingUrl)
    await page.locator('.ranking-table').waitFor()
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

    await page.goBack()
    await page.waitForURL('/')
    let startComparing = page.getByRole('button', { name: 'Start comparing' })
    let reopenedDemo = page.getByRole('button', { name: 'Open demo' })
    assert.equal(await startComparing.isEnabled(), true)
    assert.equal(await reopenedDemo.isEnabled(), true)
    assert.doesNotMatch(await page.locator('body').innerText(), /Opening…/)
    assert.equal(await page.getByRole('link', { name: /Personal sites demo/ }).count(), 1)

    await page.getByLabel('Links').fill('https://example.com\nhttps://example.org')
    await startComparing.click()
    await page.waitForURL(/\/collections\/[^/]+\/compare$/)
    await page.locator('[data-comparison]').waitFor()

    await page.goBack()
    await page.waitForURL('/')
    reopenedDemo = page.getByRole('button', { name: 'Open demo' })
    assert.equal(await reopenedDemo.isEnabled(), true)
    await reopenedDemo.click()
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

    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/')
    let homeHeading = page.getByRole('heading', { name: 'Compare websites side by side.' })
    await homeHeading.waitFor()
    assert.equal(
      await homeHeading.evaluate((element) => getComputedStyle(element).fontSize),
      await page.locator('.home-summary').evaluate((element) => getComputedStyle(element).fontSize),
    )
    assert.equal(
      await homeHeading.evaluate((element) => getComputedStyle(element).fontWeight),
      '600',
    )
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      await page.evaluate(() => window.innerWidth),
    )
    assert.equal(
      await page.locator('.home-main').evaluate((element) => element.getBoundingClientRect().width),
      296,
    )
  })

  it('exports and restores the complete browser library', { timeout: 15_000 }, async (t) => {
    let server = await createTestServer(createAppRouter().fetch)
    let page = await t.serve(server)

    await page.goto('/')
    await page.waitForFunction(() => {
      let button = document.querySelector<HTMLButtonElement>('.home-submit')
      return button?.disabled === false
    })
    await page.locator('input[name="bookmarks"]').setInputFiles({
      name: 'bookmarks.html',
      mimeType: 'text/html',
      buffer: Buffer.from(`
        <DL><p><DT><H3>Inspiration</H3><DL><p>
          <DT><A HREF="https://first.test">First</A>
          <DT><A HREF="https://second.test">Second</A>
        </DL><p></DL>
      `),
    })
    let folderSelect = page.getByLabel('Folder')
    await folderSelect.waitFor()
    assert.equal(
      await folderSelect.evaluate((element) => getComputedStyle(element).appearance),
      'none',
    )
    let folderChevron = page.locator('.home-folder-select svg')
    assert.equal(await folderChevron.count(), 1)
    assert.equal(
      await folderChevron.evaluate((element) => getComputedStyle(element).pointerEvents),
      'none',
    )
    await page.getByLabel('Links').fill('https://first.test\nhttps://second.test')
    await page.getByRole('button', { name: 'Start comparing' }).click()
    await page.waitForURL(/\/collections\/[^/]+\/compare$/)
    await page.goto('/')

    let downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export backup' }).click()
    let backupPath = await (await downloadPromise).path()
    assert.ok(backupPath)

    await page.getByLabel('Links').fill('https://third.test\nhttps://fourth.test')
    await page.getByRole('button', { name: 'Start comparing' }).click()
    await page.waitForURL(/\/collections\/[^/]+\/compare$/)
    await page.goto('/')
    assert.equal(await page.locator('.home-library-list a').count(), 2)

    await page.locator('input[name="backup"]').setInputFiles(backupPath)
    await page.getByText(/This backup contains 1 collection and 2 websites/).waitFor()
    await page.getByRole('button', { name: 'Replace library' }).click()
    await page.getByText('Restored 1 collection and 2 websites.', { exact: true }).waitFor()
    assert.equal(await page.locator('.home-library-list a').count(), 1)
    assert.equal(
      await page.locator('.home-library-list a > span:first-child').getByText('Untitled collection 2', { exact: true }).count(),
      0,
    )
  })
})
