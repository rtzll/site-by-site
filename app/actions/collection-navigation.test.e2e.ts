import * as assert from 'remix/assert'
import { createTestServer } from 'remix/node-fetch-server/test'
import { describe, it } from 'remix/test'

import { createAppRouter } from '../router.ts'

describe('saved collection navigation', () => {
  it('preserves the complete local comparison flow and responsive UI contract', { timeout: 30_000 }, async (t) => {
    let server = await createTestServer(createAppRouter().fetch)
    let page = await t.serve(server)

    await page.goto('/')
    assert.equal(
      await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(255, 255, 255)',
    )
    assert.equal(
      await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(255, 255, 255)',
    )
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#ffffff')
    assert.equal(
      await page.locator('body').evaluate((element) => getComputedStyle(element).colorScheme),
      'light',
    )
    assert.equal(await page.locator('.app-header').count(), 0)
    let startButton = page.getByRole('button', { name: 'Start comparing' })
    await page.waitForFunction(() => {
      let button = document.querySelector<HTMLButtonElement>('.home-submit')
      return button?.disabled === false
    })
    assert.equal(
      await page.locator('.home-submit').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(23, 23, 23)',
    )
    assert.equal(
      await page.locator('.home-submit').evaluate((element) => getComputedStyle(element).boxShadow),
      'none',
    )
    assert.equal(
      await page.locator('.home-preview').evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
      224,
    )
    await page.getByLabel('Links').fill('https://example.com\nhttps://example.org')
    await startButton.click()
    await page.waitForURL(/\/collections\/[^/]+\/compare$/)

    await page.goto('/')
    let collectionLink = page.getByRole('link', { name: 'Untitled collection' })
    assert.equal(await collectionLink.getAttribute('rmx-document'), '')
    await collectionLink.click()
    await page.getByRole('heading', { name: 'Untitled collection' }).waitFor()
    assert.equal(await page.locator('.app-header, .header-menu').count(), 0)
    let collectionBreadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    let libraryLink = collectionBreadcrumb.getByRole('link', { name: /Library/ })
    assert.equal(await libraryLink.getAttribute('href'), '/')
    assert.equal(await libraryLink.getAttribute('rmx-document'), '')
    let collectionRankingLink = page.getByRole('link', { name: 'Ranking' })
    assert.match(await collectionRankingLink.getAttribute('href') ?? '', /\/ranking$/)
    assert.equal(await collectionRankingLink.getAttribute('rmx-document'), '')
    assert.equal(
      await collectionRankingLink.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
      'rgb(255, 255, 255)',
    )
    assert.equal(
      await page.locator('.workspace-controls').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgba(0, 0, 0, 0)',
    )
    assert.equal(
      await page.getByRole('link', { name: 'Compare' }).evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
      'rgb(23, 23, 23)',
    )
    assert.equal(await page.getByRole('button', { name: 'Download backup' }).count(), 0)

    let pageText = await page.locator('body').innerText()
    assert.match(pageText, /Untitled collection/)
    assert.doesNotMatch(pageText, /Collection not found/)

    let collectionUrl = page.url()
    let collectionPath = new URL(collectionUrl).pathname
    let rankingPath = `${collectionPath}/ranking`
    let desktopMainWidth = await page.locator('.workspace-main').evaluate(
      (element) => element.getBoundingClientRect().width,
    )
    let desktopPageHeaderWidth = await page.locator('.workspace-page-header').evaluate(
      (element) => element.getBoundingClientRect().width,
    )
    assert.ok(desktopMainWidth <= 608)
    assert.equal(desktopPageHeaderWidth, desktopMainWidth)
    assert.equal(
      await page.locator('.workspace-stats dt').first().evaluate(
        (element) => getComputedStyle(element).color,
      ),
      'rgb(102, 102, 102)',
    )
    assert.equal(
      await page.locator('.workspace-stats dd').first().evaluate(
        (element) => getComputedStyle(element).color,
      ),
      'rgb(23, 23, 23)',
    )
    assert.equal(
      await page.locator('.workspace-stats dd').first().evaluate(
        (element) => getComputedStyle(element).fontWeight,
      ),
      '500',
    )
    assert.equal(
      await page.locator('.workspace-stats dd').first().evaluate(
        (element) => getComputedStyle(element).fontVariantNumeric,
      ),
      'tabular-nums',
    )
    await page.locator('.workspace-settings details:first-child summary').click()
    let renameButton = page.getByRole('button', { name: 'Rename' })
    await renameButton.focus()
    assert.equal(
      await renameButton.evaluate((element) => getComputedStyle(element).outlineColor),
      'rgb(23, 23, 23)',
    )

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

    for (let [name, shortcut, keycap] of [
      ['Left', 'ArrowLeft', '←'],
      ['Swap', 's', 'S'],
      ['Skip', 'ArrowDown', '↓'],
      ['Right', 'ArrowRight', '→'],
    ]) {
      let control = page.getByRole('button', { name, exact: true })
      assert.equal(await control.getAttribute('aria-keyshortcuts'), shortcut)
      assert.equal(await control.locator('kbd').innerText(), keycap)
      assert.equal(await control.locator('kbd').getAttribute('aria-hidden'), 'true')
    }
    assert.equal(await page.locator('.site-status-left button').getAttribute('aria-keyshortcuts'), 'z')
    assert.equal(await page.locator('.site-status-left button kbd').innerText(), 'Z')
    assert.equal(await page.locator('.site-status-right button').getAttribute('aria-keyshortcuts'), 'x')
    assert.equal(await page.locator('.site-status-right button kbd').innerText(), 'X')

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
    let undoButton = page.getByRole('button', { name: 'Undo', exact: true })
    await undoButton.waitFor()
    assert.equal(await undoButton.locator('kbd').innerText(), 'U')
    assert.equal(await undoButton.locator('kbd').getAttribute('aria-hidden'), 'true')
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
    let emptyViewCollection = page.getByRole('link', { name: 'View collection' })
    let emptyViewRanking = page.getByRole('link', { name: 'View ranking' })
    assert.equal(await emptyViewCollection.getAttribute('href'), collectionPath)
    assert.equal(await emptyViewCollection.getAttribute('rmx-document'), '')
    assert.equal(await emptyViewRanking.getAttribute('href'), rankingPath)
    assert.equal(await emptyViewRanking.getAttribute('rmx-document'), '')
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
    assert.equal(await page.locator('.app-header').count(), 0)
    assert.match(await page.locator('.comparison-width-state').innerText(), /at least 640 pixels wide/)
    assert.equal(
      await page.getByRole('link', { name: 'View collection' }).getAttribute('href'),
      collectionPath,
    )
    assert.equal(
      await page.getByRole('link', { name: 'View ranking' }).getAttribute('href'),
      rankingPath,
    )
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
    assert.equal(await page.locator('.app-header, .header-menu').count(), 0)
    let mobileLibraryLink = page.getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: /Library/ })
    assert.equal(
      await mobileLibraryLink.evaluate((element) => element.getBoundingClientRect().height),
      48,
    )
    let rankingLink = page.getByRole('link', { name: 'Ranking' })
    assert.equal(
      await rankingLink.evaluate((element) => element.getBoundingClientRect().height),
      48,
    )
    await page.setViewportSize({ width: 320, height: 700 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      await page.evaluate(() => window.innerWidth),
    )
    assert.equal(
      await page.locator('.workspace-main').evaluate((element) => element.getBoundingClientRect().width),
      296,
    )
    assert.equal(await rankingLink.getAttribute('rmx-document'), '')
    await rankingLink.click()
    let rankingUrl = page.url()
    await page.getByRole('heading', { name: 'Ranking', exact: true }).waitFor()
    await page.getByRole('heading', { name: 'No ranking yet' }).waitFor()
    assert.equal(await page.locator('.ranking-table').count(), 0)
    let rankingBreadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    assert.match(await rankingBreadcrumb.innerText(), /Library\s*\/\s*Untitled collection/)
    let rankingCollectionLink = rankingBreadcrumb.getByRole('link', {
      name: 'Untitled collection',
    })
    assert.equal(await rankingCollectionLink.getAttribute('href'), collectionPath)
    assert.equal(await rankingCollectionLink.getAttribute('rmx-document'), '')
    let firstComparisonLink = page.getByRole('link', { name: 'Start comparing' })
    assert.equal(await firstComparisonLink.getAttribute('rmx-document'), '')
    await page.setViewportSize({ width: 640, height: 844 })
    await firstComparisonLink.click()
    await page.locator('[data-comparison]').waitFor()
    await page.keyboard.press('ArrowLeft')
    await page.getByText('Choice saved', { exact: true }).waitFor()

    await page.goto(rankingUrl)
    await page.locator('.ranking-table').waitFor()
    assert.equal(
      await page.getByRole('columnheader', { name: 'Position' }).evaluate(
        (element) => getComputedStyle(element).textAlign,
      ),
      'right',
    )
    assert.equal(
      await page.getByRole('columnheader', { name: 'Score' }).evaluate(
        (element) => getComputedStyle(element).textAlign,
      ),
      'right',
    )
    assert.equal(
      await page.getByRole('columnheader', { name: 'Comparisons' }).evaluate(
        (element) => getComputedStyle(element).textAlign,
      ),
      'right',
    )
    for (let cell of await page.locator('.numeric-cell').all()) {
      assert.equal(await cell.evaluate((element) => getComputedStyle(element).textAlign), 'right')
    }
    for (let cell of await page.locator('.rank-position').all()) {
      assert.equal(await cell.evaluate((element) => getComputedStyle(element).textAlign), 'right')
    }

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

  it('keeps missing collection states navigable without global chrome', { timeout: 15_000 }, async (t) => {
    let server = await createTestServer(createAppRouter().fetch)
    let page = await t.serve(server)

    for (let path of [
      '/collections/missing-local-collection',
      '/collections/missing-local-collection/ranking',
      '/collections/missing-local-collection/compare',
    ]) {
      await page.goto(path)
      await page.getByRole('heading', { name: 'Collection not found' }).waitFor()
      assert.equal(await page.locator('.app-header, .header-menu').count(), 0)
      let returnHome = page.getByRole('link', { name: 'Return home' })
      assert.equal(await returnHome.getAttribute('href'), '/')
      assert.equal(await returnHome.getAttribute('rmx-document'), '')
    }
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
    assert.equal(
      await homeHeading.evaluate((element) => element.getBoundingClientRect().top),
      40,
    )
    let preview = page.locator('.home-preview')
    assert.equal(await preview.evaluate((element) => getComputedStyle(element).boxShadow), 'none')
    assert.equal(
      await preview.locator('button, a, input, select, textarea, [tabindex]').count(),
      0,
    )
    assert.equal(await preview.locator('.home-preview-scenes').getAttribute('aria-hidden'), 'true')
    assert.equal(
      await preview.locator('.home-preview-scenes').evaluate(
        (element) => getComputedStyle(element).pointerEvents,
      ),
      'none',
    )
    assert.equal(
      await page.locator('.home-preview-left').evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
      'rgb(198, 104, 69)',
    )
    assert.equal(
      await page.locator('.home-preview-right').evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
      'rgb(49, 90, 103)',
    )
    let previewGeometry = await preview.evaluate((element) => {
      let previewBounds = element.getBoundingClientRect()
      let bounds = (selector: string) => {
        let target = element.querySelector<HTMLElement>(selector)
        if (!target) throw new Error(`Missing preview element: ${selector}`)
        return target.getBoundingClientRect()
      }
      let midpoint = previewBounds.left + previewBounds.width / 2
      let leftScene = bounds('.home-preview-left')
      let rightScene = bounds('.home-preview-right')
      let leftObject = bounds('.home-preview-object-left')
      let rightObject = bounds('.home-preview-object-right')
      let leftDetail = bounds('.home-preview-site-detail-left')
      let rightDetail = bounds('.home-preview-site-detail-right')
      let leftStatus = bounds('.home-preview-status-left')
      let rightStatus = bounds('.home-preview-status-right')
      let dock = bounds('.home-preview-dock')
      let divider = element.querySelector<HTMLElement>('[data-home-divider]')
      let overlays = [leftStatus, rightStatus, dock]

      return {
        height: previewBounds.height,
        scenesFillPreview:
          leftScene.width >= previewBounds.width - 2 &&
          rightScene.width >= previewBounds.width - 2,
        leftObjectCrossesMidpoint: leftObject.left < midpoint && leftObject.right > midpoint,
        rightObjectCrossesMidpoint: rightObject.left < midpoint && rightObject.right > midpoint,
        leftRevealIsConcealed: leftDetail.left > midpoint,
        rightRevealIsConcealed: rightDetail.right < midpoint,
        overlaysStayInside: overlays.every(
          (overlay) =>
            overlay.left >= previewBounds.left &&
            overlay.right <= previewBounds.right &&
            overlay.top >= previewBounds.top &&
            overlay.bottom <= previewBounds.bottom,
        ),
        dockClearsStatuses:
          dock.top >= leftStatus.bottom && dock.top >= rightStatus.bottom,
        dockMidpointTargetsDivider:
          document
            .elementFromPoint(midpoint, dock.top + dock.height / 2)
            ?.closest('[data-home-divider]') === divider,
      }
    })
    assert.equal(previewGeometry.height, 176)
    assert.equal(previewGeometry.scenesFillPreview, true)
    assert.equal(previewGeometry.leftObjectCrossesMidpoint, true)
    assert.equal(previewGeometry.rightObjectCrossesMidpoint, true)
    assert.equal(previewGeometry.leftRevealIsConcealed, true)
    assert.equal(previewGeometry.rightRevealIsConcealed, true)
    assert.equal(previewGeometry.overlaysStayInside, true)
    assert.equal(previewGeometry.dockClearsStatuses, true)
    assert.equal(previewGeometry.dockMidpointTargetsDivider, true)

    let homeDivider = preview.locator('[data-home-divider]')
    assert.equal(await homeDivider.evaluate((element) => element.tagName), 'DIV')
    assert.equal(await homeDivider.getAttribute('tabindex'), null)
    assert.equal(await homeDivider.getAttribute('role'), null)
    assert.equal(await homeDivider.getAttribute('aria-hidden'), 'true')

    let initialClipPaths = await preview.evaluate((element) => ({
      left: getComputedStyle(element.querySelector<HTMLElement>('.home-preview-left')!).clipPath,
      right: getComputedStyle(element.querySelector<HTMLElement>('.home-preview-right')!).clipPath,
    }))
    let previewBox = await preview.boundingBox()
    assert.ok(previewBox)
    await page.mouse.move(
      previewBox.x + previewBox.width / 2,
      previewBox.y + previewBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      previewBox.x + previewBox.width * .8,
      previewBox.y + previewBox.height / 2,
    )
    await page.mouse.up()

    assert.equal(
      await preview.evaluate((element) => document.activeElement === element),
      true,
    )
    assert.equal(
      await homeDivider.evaluate((element) => document.activeElement === element),
      false,
    )
    let draggedState = await preview.evaluate((element) => ({
      percent: Number.parseFloat(element.style.getPropertyValue('--divider')),
      left: getComputedStyle(element.querySelector<HTMLElement>('.home-preview-left')!).clipPath,
      right: getComputedStyle(element.querySelector<HTMLElement>('.home-preview-right')!).clipPath,
    }))
    assert.ok(draggedState.percent > 75)
    assert.notEqual(draggedState.left, initialClipPaths.left)
    assert.notEqual(draggedState.right, initialClipPaths.right)

    await page.keyboard.press('ArrowRight')
    await preview.locator('.vote-feedback.is-visible.feedback-right').waitFor()
    assert.equal(
      await preview.evaluate((element) =>
        Number.parseFloat(element.style.getPropertyValue('--divider')),
      ),
      draggedState.percent,
    )
    await preview.locator('.vote-feedback.is-visible').waitFor({ state: 'hidden' })
    await page.keyboard.press('ArrowLeft')
    await preview.locator('.vote-feedback.is-visible.feedback-left').waitFor()
    await preview.locator('.vote-feedback.is-visible').waitFor({ state: 'hidden' })

    await page.keyboard.press('s')
    await page.getByText('Sides switched', { exact: true }).waitFor({ timeout: 3_000 })
    let swappedPreview = await preview.evaluate((element) => ({
      percent: Number.parseFloat(element.style.getPropertyValue('--divider')),
      leftSiteClip: getComputedStyle(
        element.querySelector<HTMLElement>('.home-preview-left')!,
      ).clipPath,
      rightSiteClip: getComputedStyle(
        element.querySelector<HTMLElement>('.home-preview-right')!,
      ).clipPath,
      leftDomain: element.querySelector('.home-preview-status-left .home-preview-status-domain')
        ?.textContent?.trim(),
      rightDomain: element.querySelector('.home-preview-status-right .home-preview-status-domain')
        ?.textContent?.trim(),
    }))
    assert.equal(swappedPreview.percent, 50)
    assert.equal(swappedPreview.leftSiteClip, initialClipPaths.right)
    assert.equal(swappedPreview.rightSiteClip, initialClipPaths.left)
    assert.equal(swappedPreview.leftDomain, 'fieldnotes.test')
    assert.equal(swappedPreview.rightDomain, 'studio.test')

    await page.getByLabel('Links').focus()
    await page.keyboard.press('s')
    assert.equal(
      await preview.locator('.home-preview-status-left .home-preview-status-domain').innerText(),
      'fieldnotes.test',
    )

    await preview.focus()
    await page.keyboard.press('s')
    let restoredPreview = await preview.evaluate((element) => ({
      leftSiteClip: getComputedStyle(
        element.querySelector<HTMLElement>('.home-preview-left')!,
      ).clipPath,
      rightSiteClip: getComputedStyle(
        element.querySelector<HTMLElement>('.home-preview-right')!,
      ).clipPath,
      leftDomain: element.querySelector('.home-preview-status-left .home-preview-status-domain')
        ?.textContent?.trim(),
      rightDomain: element.querySelector('.home-preview-status-right .home-preview-status-domain')
        ?.textContent?.trim(),
    }))
    assert.equal(restoredPreview.leftSiteClip, initialClipPaths.left)
    assert.equal(restoredPreview.rightSiteClip, initialClipPaths.right)
    assert.equal(restoredPreview.leftDomain, 'studio.test')
    assert.equal(restoredPreview.rightDomain, 'fieldnotes.test')
    await page
      .getByText('Drag the divider to inspect both sites', { exact: true })
      .waitFor({ timeout: 3_000 })

    await page.getByRole('button', { name: 'Open demo' }).focus()
    await page.keyboard.press('s')
    assert.equal(
      await preview.locator('.home-preview-status-left .home-preview-status-domain').innerText(),
      'studio.test',
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
    let compareFolder = page.getByRole('button', { name: 'Compare folder' })
    let startComparing = page.getByRole('button', { name: 'Start comparing' })
    let openDemo = page.getByRole('button', { name: 'Open demo' })
    await page.mouse.move(0, 0)
    assert.match(await compareFolder.getAttribute('class') ?? '', /home-control-secondary/)
    assert.equal(
      await compareFolder.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(255, 255, 255)',
    )
    assert.equal(
      await compareFolder.evaluate((element) => getComputedStyle(element).color),
      'rgb(23, 23, 23)',
    )
    assert.equal(
      await startComparing.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(23, 23, 23)',
    )
    assert.equal(
      await openDemo.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgba(0, 0, 0, 0)',
    )
    assert.equal(await page.locator('.home-control:not(.home-control-secondary):not(.home-demo-control)').count(), 1)
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
