import {
  clientEntry,
  on,
  type Handle,
  type RemixNode,
  type SerializableProps,
} from 'remix/component'

import { demoCollectionName, demoWebsiteUrls } from '../data/demo-websites.ts'
import {
  openLocalLibrary,
  parseLocalLibraryExport,
  type CollectionSummary,
  type ComparisonPair,
  type LocalLibrary,
  type LocalLibraryExport,
  type VoteChoice,
  type WebsiteRecord,
} from '../data/local-library.ts'
import { routes } from '../routes.ts'
import { orientPair, translateVisibleChoice } from '../services/pair-orientation.ts'
import { parseBookmarkHtml, type BookmarkFolder } from '../utils/bookmarks.ts'
import { extractUrls } from '../utils/urls.ts'

export type AppPageKind = 'home' | 'collection' | 'compare' | 'ranking'
export const SiteBySiteEntryId = 'SiteBySiteApp'

interface SiteBySiteAppProps extends SerializableProps {
  page: AppPageKind
  collectionId?: string
}

type PendingAction =
  | 'import-bookmarks'
  | 'import-links'
  | 'open-demo'
  | 'rename-collection'
  | 'add-websites'
  | 'restore-backup'
  | null

const comparisonNoticeDuration = 4_000
const homeFeedbackDuration = 240

export const SiteBySiteApp = clientEntry(
  SiteBySiteEntryId,
  function SiteBySiteApp(handle: Handle<SiteBySiteAppProps>) {
    let library: LocalLibrary | null = null
    let collections: CollectionSummary[] = []
    let collection: CollectionSummary | null = null
    let ranking: WebsiteRecord[] = []
    let pair: ComparisonPair | null = null
    let loading = handle.props.page !== 'home'
    let working = false
    let pendingAction: PendingAction = null
    let error: string | null = null
    let bookmarkFolders: BookmarkFolder[] = []
    let selectedFolderPath: string | null = null
    let homeDividerPercent = 50
    let draggingHomeDivider = false
    let homeFeedbackChoice: Exclude<VoteChoice, 'skip'> | null = null
    let homeFeedbackVersion = 0
    let homeSidesSwapped = false
    let homeSwapAcknowledgement = false
    let homeSwapAcknowledgementVersion = 0
    let dividerPercent = 50
    let savedDividerPercent = 50
    let draggingDivider = false
    let pairLoading = false
    let loadedSides = new Set<'left' | 'right'>()
    let keyboardPaused = false
    let sidesSwapped = false
    let swapAcknowledgement = false
    let swapAcknowledgementVersion = 0
    let feedbackChoice: VoteChoice | null = null
    let undoAvailable = false
    let comparisonNotice: string | null = null
    let comparisonNoticeVersion = 0
    let comparisonViewportSupported = true
    let pendingBackup: LocalLibraryExport | null = null
    let backupStatus: string | null = null
    let backupError: string | null = null
    let initialized = false

    if (typeof window !== 'undefined') {
      handle.queueTask(() => {
        if (initialized) return
        initialized = true
        installComparisonViewport()
        installComparisonControls()
        installHomePreviewControls()
        void initialize()
      })
    }

    async function initialize() {
      try {
        library = await openLocalLibrary()
        if (handle.props.page === 'home') {
          collections = await library.listCollections()
        } else if (handle.props.collectionId) {
          collection = await library.getCollection(handle.props.collectionId)
          undoAvailable = Boolean(collection?.canUndoLastAction)
          if (handle.props.page === 'ranking') {
            ranking = await library.getRanking(handle.props.collectionId)
          }
          if (handle.props.page === 'compare' && collection) {
            pair = await library.getNextPair(collection.id)
            preparePair()
          }
        }
      } catch (caught) {
        error = messageFrom(caught, 'Your local library could not be opened.')
      } finally {
        loading = false
        await handle.update()
        if (handle.props.page === 'compare' && pair) focusComparisonStage()
      }
    }

    function installComparisonViewport() {
      if (handle.props.page !== 'compare') return
      let mediaQuery = window.matchMedia('(min-width: 640px)')
      comparisonViewportSupported = mediaQuery.matches
      let onChange = (event: MediaQueryListEvent) => {
        comparisonViewportSupported = event.matches
        keyboardPaused = false
        void handle.update().then(() => {
          if (comparisonViewportSupported && pair) focusComparisonStage()
        })
      }
      mediaQuery.addEventListener('change', onChange)
      handle.signal.addEventListener('abort', () => {
        mediaQuery.removeEventListener('change', onChange)
      })
    }

    function installComparisonControls() {
      if (handle.props.page !== 'compare') return

      let onKeyDown = (event: KeyboardEvent) => {
        if (
          !comparisonViewportSupported ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          working ||
          event.repeat
        ) return
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          void submitChoice('left')
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          void submitChoice('right')
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          void submitChoice('skip')
        }
        if (event.key.toLowerCase() === 's') {
          event.preventDefault()
          swapSides()
        }
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault()
          markVisibleSideUnavailable('left')
        }
        if (event.key.toLowerCase() === 'x') {
          event.preventDefault()
          markVisibleSideUnavailable('right')
        }
        if (event.key.toLowerCase() === 'u') {
          event.preventDefault()
          void undoLastComparisonAction()
        }
        if (event.key === '1') {
          event.preventDefault()
          savedDividerPercent = dividerPercent
          setDivider(100)
        }
        if (event.key === '2') {
          event.preventDefault()
          savedDividerPercent = dividerPercent
          setDivider(0)
        }
      }
      let onKeyUp = (event: KeyboardEvent) => {
        if (event.key === '1' || event.key === '2') setDivider(savedDividerPercent)
      }
      let onWindowBlur = () => {
        // Touch-only devices have no shortcuts to pause, so the hint would only confuse.
        if (!window.matchMedia('(any-pointer: fine)').matches) return
        window.setTimeout(() => {
          if (document.activeElement instanceof HTMLIFrameElement) {
            keyboardPaused = true
            void handle.update()
          }
        })
      }

      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', onWindowBlur)
      handle.signal.addEventListener('abort', () => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', onWindowBlur)
      })
    }

    function installHomePreviewControls() {
      if (handle.props.page !== 'home') return

      let onKeyDown = (event: KeyboardEvent) => {
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.repeat ||
          (event.target instanceof Element &&
            event.target.closest(
              'a, button, input, select, summary, textarea, [contenteditable="true"]',
            ))
        ) return

        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          void showHomeChoiceFeedback('left')
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          void showHomeChoiceFeedback('right')
        }
        if (event.key.toLowerCase() === 's') {
          event.preventDefault()
          void swapHomeSides()
        }
      }

      window.addEventListener('keydown', onKeyDown)
      handle.signal.addEventListener('abort', () => {
        window.removeEventListener('keydown', onKeyDown)
      })
    }

    async function showHomeChoiceFeedback(choice: Exclude<VoteChoice, 'skip'>) {
      let version = ++homeFeedbackVersion
      homeFeedbackChoice = choice
      await handle.update()
      await delay(homeFeedbackDuration)
      if (homeFeedbackVersion !== version || handle.signal.aborted) return
      homeFeedbackChoice = null
      await handle.update()
    }

    async function swapHomeSides() {
      homeSidesSwapped = !homeSidesSwapped
      homeSwapAcknowledgement = true
      let version = ++homeSwapAcknowledgementVersion
      homeFeedbackChoice = null
      homeFeedbackVersion += 1
      setHomeDivider(50)
      await handle.update()
      await delay(1_000)
      if (homeSwapAcknowledgementVersion !== version || handle.signal.aborted) return
      homeSwapAcknowledgement = false
      await handle.update()
    }

    function setHomeDivider(percent: number) {
      homeDividerPercent = Math.min(100, Math.max(0, percent))
      let preview = document.querySelector<HTMLElement>('[data-home-comparison]')
      preview?.style.setProperty('--divider', `${homeDividerPercent}%`)
    }

    function moveHomeDivider(clientX: number) {
      let preview = document.querySelector<HTMLElement>('[data-home-comparison]')
      if (!preview) return
      let bounds = preview.getBoundingClientRect()
      setHomeDivider(((clientX - bounds.left) / bounds.width) * 100)
    }

    function homeDividerPointerDown(event: Event) {
      let pointerEvent = event as PointerEvent
      let divider = event.currentTarget as HTMLDivElement
      document
        .querySelector<HTMLElement>('[data-home-comparison]')
        ?.focus({ preventScroll: true })
      divider.setPointerCapture(pointerEvent.pointerId)
      draggingHomeDivider = true
      moveHomeDivider(pointerEvent.clientX)
    }

    function homeDividerPointerMove(event: Event) {
      if (draggingHomeDivider) moveHomeDivider((event as PointerEvent).clientX)
    }

    function homeDividerPointerUp(event: Event) {
      let pointerEvent = event as PointerEvent
      draggingHomeDivider = false
      let divider = event.currentTarget as HTMLDivElement
      if (divider.hasPointerCapture(pointerEvent.pointerId)) {
        divider.releasePointerCapture(pointerEvent.pointerId)
      }
    }

    async function importPastedUrls(event: Event) {
      event.preventDefault()
      if (!library || working) return
      let form = event.currentTarget as HTMLFormElement
      let urls = extractUrls(String(new FormData(form).get('urls') ?? ''))
      if (urls.length < 2) {
        error = 'Add at least two valid website URLs.'
        await handle.update()
        return
      }

      working = true
      pendingAction = 'import-links'
      error = null
      await handle.update()
      try {
        let created = await library.createCollection({ sourceType: 'paste', websites: urls })
        await requestPersistentStorage()
        await navigateToComparison(created.id)
      } catch (caught) {
        working = false
        pendingAction = null
        error = messageFrom(caught, 'The collection could not be saved.')
        await handle.update()
      }
    }

    async function readBookmarkFile(file: File) {
      if (file.size > 25_000_000) {
        error = 'That bookmarks file is larger than 25 MB.'
        await handle.update()
        return
      }
      let folders = parseBookmarkHtml(await file.text()).filter((folder) => folder.urls.length > 0)
      if (folders.length === 0) {
        error = 'No bookmark folders containing website URLs were found.'
        await handle.update()
        return
      }
      bookmarkFolders = folders
      selectedFolderPath = folders[0]!.path
      error = null
      await handle.update()
    }

    async function importBookmarkFolder() {
      if (!library || working) return
      let folder = bookmarkFolders.find((candidate) => candidate.path === selectedFolderPath)
      if (!folder) return
      let websites = extractUrls(folder.urls.join('\n'))
      if (websites.length < 2) {
        error = 'Choose a folder containing at least two valid websites.'
        await handle.update()
        return
      }

      working = true
      pendingAction = 'import-bookmarks'
      error = null
      await handle.update()
      try {
        let created = await library.createCollection({
          name: folder.name,
          sourceType: 'bookmarks',
          websites,
        })
        await requestPersistentStorage()
        await navigateToComparison(created.id)
      } catch (caught) {
        working = false
        pendingAction = null
        error = messageFrom(caught, 'The bookmarks could not be saved.')
        await handle.update()
      }
    }

    async function startDemo() {
      if (!library || working) return

      working = true
      pendingAction = 'open-demo'
      error = null
      await handle.update()
      try {
        let demo = (await library.listCollections()).find((saved) => saved.sourceType === 'demo')
        demo ??= await library.createCollection({
          name: demoCollectionName,
          sourceType: 'demo',
          websites: extractUrls(demoWebsiteUrls.join('\n')),
        })
        await requestPersistentStorage()
        await navigateToComparison(demo.id)
      } catch (caught) {
        working = false
        pendingAction = null
        error = messageFrom(caught, 'The demo collection could not be opened.')
        await handle.update()
      }
    }

    async function navigateToComparison(collectionId: string) {
      if (library && handle.props.page === 'home') {
        collections = await library.listCollections()
      }
      working = false
      pendingAction = null
      await handle.update()
      window.location.assign(routes.collections.compare.href({ collectionId }))
    }

    async function addWebsites(event: Event) {
      event.preventDefault()
      if (!library || !collection || working) return
      let form = event.currentTarget as HTMLFormElement
      let websites = extractUrls(String(new FormData(form).get('urls') ?? ''))
      if (websites.length === 0) {
        error = 'No valid website URLs were found.'
        await handle.update()
        return
      }
      working = true
      pendingAction = 'add-websites'
      error = null
      await handle.update()
      try {
        collection = await library.addWebsites(collection.id, websites)
        form.reset()
      } catch (caught) {
        error = messageFrom(caught, 'The websites could not be added.')
      } finally {
        working = false
        pendingAction = null
        await handle.update()
      }
    }

    async function renameCollection(event: Event) {
      event.preventDefault()
      if (!library || !collection || working) return
      let form = event.currentTarget as HTMLFormElement
      let name = String(new FormData(form).get('name') ?? '')
      working = true
      pendingAction = 'rename-collection'
      error = null
      await handle.update()
      try {
        collection = await library.renameCollection(collection.id, name)
      } catch (caught) {
        error = messageFrom(caught, 'The collection could not be renamed.')
      } finally {
        working = false
        pendingAction = null
        await handle.update()
      }
    }

    async function submitChoice(choice: VoteChoice) {
      if (!library || !collection || !pair || working) return
      working = true
      feedbackChoice = choice
      keyboardPaused = false
      error = null
      clearComparisonNotice()
      await handle.update()
      try {
        await library.recordChoice({
          collectionId: collection.id,
          pairId: pair.id,
          choice: translateVisibleChoice(choice, sidesSwapped),
        })
        await delay(120)
        pair = await library.getNextPair(collection.id)
        collection = await library.getCollection(collection.id)
        feedbackChoice = null
        preparePair()
        undoAvailable = Boolean(collection?.canUndoLastAction)
        showComparisonNotice(choice === 'skip' ? 'Pair skipped' : 'Choice saved')
        error = null
      } catch (caught) {
        feedbackChoice = null
        error = messageFrom(caught, 'That choice could not be saved.')
      } finally {
        working = false
        await handle.update()
        if (pair) focusComparisonStage()
      }
    }

    async function markUnavailable(websiteId: string) {
      if (!library || !collection || !pair || working) return
      working = true
      pairLoading = true
      error = null
      clearComparisonNotice()
      await handle.update()
      try {
        pair = await library.markSiteUnavailable({
          collectionId: collection.id,
          pairId: pair.id,
          websiteId,
        })
        collection = await library.getCollection(collection.id)
        preparePair()
        undoAvailable = Boolean(collection?.canUndoLastAction)
        showComparisonNotice('Site removed from comparisons')
        error = null
      } catch (caught) {
        pairLoading = false
        error = messageFrom(caught, 'That site could not be marked unavailable.')
      } finally {
        working = false
        await handle.update()
        if (pair) focusComparisonStage()
      }
    }

    async function undoLastComparisonAction() {
      if (!library || !collection || working || !undoAvailable) return
      working = true
      error = null
      clearComparisonNotice()
      await handle.update()
      try {
        let restoredPair = await library.undoLastAction(collection.id)
        collection = await library.getCollection(collection.id)
        undoAvailable = Boolean(collection?.canUndoLastAction)
        if (!restoredPair) {
          error = 'There is no comparison action to undo.'
          return
        }
        pair = restoredPair
        preparePair()
        showComparisonNotice('Last action undone')
      } catch (caught) {
        error = messageFrom(caught, 'The last action could not be undone.')
      } finally {
        working = false
        await handle.update()
        if (pair) focusComparisonStage()
      }
    }

    function clearComparisonNotice() {
      comparisonNoticeVersion += 1
      comparisonNotice = null
    }

    function showComparisonNotice(message: string) {
      comparisonNotice = message
      let version = ++comparisonNoticeVersion
      window.setTimeout(() => {
        if (comparisonNoticeVersion !== version || handle.signal.aborted) return
        comparisonNotice = null
        void handle.update()
      }, comparisonNoticeDuration)
    }

    function markVisibleSideUnavailable(side: 'left' | 'right') {
      if (!pair) return
      void markUnavailable(orientPair(pair, sidesSwapped)[side].id)
    }

    function preparePair() {
      dividerPercent = 50
      pairLoading = Boolean(pair)
      loadedSides = new Set()
      keyboardPaused = false
      sidesSwapped = false
      swapAcknowledgement = false
      swapAcknowledgementVersion += 1
      if (!pair) return
      let pairId = pair.id
      window.setTimeout(() => {
        if (pair?.id !== pairId) return
        pairLoading = false
        void handle.update()
      }, 2_500)
    }

    function frameLoaded(side: 'left' | 'right') {
      loadedSides.add(side)
      if (loadedSides.size === 2) pairLoading = false
      // Re-render after each side so a slow side's loading indicator clears on its own.
      void handle.update()
    }

    function setDivider(percent: number) {
      dividerPercent = Math.min(100, Math.max(0, percent))
      document
        .querySelector<HTMLElement>('[data-comparison]')
        ?.style.setProperty('--divider', `${dividerPercent}%`)
    }

    function moveDivider(clientX: number) {
      setDivider((clientX / window.innerWidth) * 100)
    }

    function swapSides() {
      if (!pair || working) return
      sidesSwapped = !sidesSwapped
      swapAcknowledgement = true
      let acknowledgementVersion = ++swapAcknowledgementVersion
      keyboardPaused = false
      setDivider(50)
      let pairId = pair.id
      void handle.update().then(focusComparisonStage)
      window.setTimeout(() => {
        if (pair?.id !== pairId || swapAcknowledgementVersion !== acknowledgementVersion) return
        swapAcknowledgement = false
        void handle.update()
      }, 1_000)
    }

    function dividerPointerDown(event: Event) {
      let pointerEvent = event as PointerEvent
      let divider = event.currentTarget as HTMLDivElement
      focusComparisonStage()
      divider.setPointerCapture(pointerEvent.pointerId)
      draggingDivider = true
      keyboardPaused = false
      moveDivider(pointerEvent.clientX)
    }

    function dividerPointerMove(event: Event) {
      if (draggingDivider) moveDivider((event as PointerEvent).clientX)
    }

    function dividerPointerUp(event: Event) {
      let pointerEvent = event as PointerEvent
      draggingDivider = false
      let divider = event.currentTarget as HTMLDivElement
      if (divider.hasPointerCapture(pointerEvent.pointerId)) {
        divider.releasePointerCapture(pointerEvent.pointerId)
      }
      void handle.update()
    }

    function focusComparisonStage() {
      window.setTimeout(() => {
        document.querySelector<HTMLElement>('[data-comparison]')?.focus({ preventScroll: true })
      })
    }

    async function exportBackup() {
      if (!library) return
      backupError = null
      backupStatus = null
      try {
        let backup = await library.exportData()
        let url = URL.createObjectURL(
          new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
        )
        let link = document.createElement('a')
        link.href = url
        link.download = `site-by-site-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)
      } catch (caught) {
        backupError = messageFrom(caught, 'The backup could not be exported.')
        await handle.update()
      }
    }

    async function readBackupFile(file: File) {
      pendingBackup = null
      backupStatus = null
      backupError = null
      if (file.size > 100_000_000) {
        backupError = 'That backup is larger than 100 MB.'
        await handle.update()
        return
      }

      try {
        pendingBackup = parseLocalLibraryExport(JSON.parse(await file.text()))
      } catch (caught) {
        backupError = messageFrom(caught, 'That backup could not be read.')
      }
      await handle.update()
    }

    async function restoreBackup() {
      if (!library || !pendingBackup || working) return
      working = true
      pendingAction = 'restore-backup'
      backupError = null
      backupStatus = null
      await handle.update()
      try {
        let restored = await library.restoreData(pendingBackup)
        collections = await library.listCollections()
        pendingBackup = null
        backupStatus = `Restored ${countLabel(restored.collectionCount, 'collection')} and ${countLabel(restored.websiteCount, 'website')}.`
        await requestPersistentStorage()
      } catch (caught) {
        backupError = messageFrom(caught, 'The library could not be restored.')
      } finally {
        working = false
        pendingAction = null
        await handle.update()
      }
    }

    function renderHome() {
      return (
        <div class="app-shell home-shell">
          <main class="home-main isolate">
            <section class="home-entry" aria-labelledby="home-heading">
              <h1 class="home-heading" id="home-heading">
                Compare websites side by side.
              </h1>
              <div
                class="home-preview"
                style={{ '--divider': `${homeDividerPercent}%` }}
                tabIndex={-1}
                data-home-comparison
              >
                <div class="home-preview-scenes" aria-hidden="true">
                  <div
                    class={`home-preview-side home-preview-left ${homeSidesSwapped ? 'home-preview-visible-right' : 'home-preview-visible-left'}`}
                  >
                    <div class="home-preview-page home-preview-page-left">
                      <p class="home-preview-site-eyebrow">Edition 04</p>
                      <strong class="home-preview-site-title">Objects for<br />quiet rooms.</strong>
                      <div class="home-preview-object home-preview-object-left"></div>
                      <div class="home-preview-site-detail home-preview-site-detail-left">
                        <span>Oak</span>
                        <span>Linen</span>
                        <span>Steel</span>
                      </div>
                      <p class="home-preview-site-meta">Made slowly in Berlin.</p>
                    </div>
                  </div>
                  <div
                    class={`home-preview-side home-preview-right ${homeSidesSwapped ? 'home-preview-visible-left' : 'home-preview-visible-right'}`}
                  >
                    <div class="home-preview-page home-preview-page-right">
                      <p class="home-preview-site-eyebrow">Field note 12</p>
                      <strong class="home-preview-site-title">Ideas for<br />loud places.</strong>
                      <div class="home-preview-object home-preview-object-right"></div>
                      <div class="home-preview-site-detail home-preview-site-detail-right">
                        <span>52.5200° N</span>
                        <span>13.4050° E</span>
                        <span>Night / 24°C</span>
                      </div>
                      <p class="home-preview-site-meta">Recorded after midnight.</p>
                    </div>
                  </div>
                  <div class="home-preview-status home-preview-status-left">
                    <span class="home-preview-status-domain">
                      {homeSidesSwapped ? 'fieldnotes.test' : 'studio.test'}
                    </span>
                    <span class="home-preview-status-action">
                      <span class="home-preview-status-action-label">Didn’t load?</span>
                      <kbd class="home-preview-key">Z</kbd>
                    </span>
                  </div>
                  <div class="home-preview-status home-preview-status-right">
                    <span class="home-preview-status-domain">
                      {homeSidesSwapped ? 'studio.test' : 'fieldnotes.test'}
                    </span>
                    <span class="home-preview-status-action">
                      <span class="home-preview-status-action-label">Didn’t load?</span>
                      <kbd class="home-preview-key">X</kbd>
                    </span>
                  </div>
                  <div class="home-preview-dock">
                    <p>
                      {homeSwapAcknowledgement
                        ? 'Sides switched'
                        : 'Drag the divider to inspect both sites'}
                    </p>
                    <div class="home-preview-actions">
                      <span>Left <kbd class="home-preview-key">←</kbd></span>
                      <span>Swap <kbd class="home-preview-key">S</kbd></span>
                      <span>Skip <kbd class="home-preview-key">↓</kbd></span>
                      <span>Right <kbd class="home-preview-key">→</kbd></span>
                    </div>
                  </div>
                  <div class={`vote-feedback${homeFeedbackChoice ? ` is-visible feedback-${homeFeedbackChoice}` : ''}`}></div>
                </div>
                <div
                  class="home-preview-divider"
                  aria-hidden="true"
                  data-home-divider
                  mix={[
                    on<HTMLDivElement>('pointerdown', homeDividerPointerDown),
                    on<HTMLDivElement>('pointermove', homeDividerPointerMove),
                    on<HTMLDivElement>('pointerup', homeDividerPointerUp),
                    on<HTMLDivElement>('pointercancel', homeDividerPointerUp),
                    on<HTMLDivElement>('dblclick', () => setHomeDivider(50)),
                  ]}
                >
                  <span class="divider-line"></span><span class="divider-handle"></span>
                </div>
              </div>
              <p class="home-summary">
                Add bookmarks or paste links. Each choice builds a ranking stored only in this
                browser.
              </p>
              <p class="home-width-note">
                Comparing needs a screen at least 640 pixels wide. Add sites here, then compare on
                a tablet or computer.
              </p>

              {error ? <p class="home-error" role="alert">{error}</p> : null}

              <div class="home-import">
                <section class="home-import-method" aria-labelledby="bookmark-heading">
                  <div class="home-method-heading">
                    <h2 id="bookmark-heading">Bookmarks</h2>
                    <span>HTML · 25 MB max</span>
                  </div>
                  <label
                    class="home-drop-zone"
                    mix={[
                      on<HTMLLabelElement>('dragenter', (event) => {
                        event.preventDefault()
                        event.currentTarget.classList.add('is-dragging')
                      }),
                      on<HTMLLabelElement>('dragover', (event) => event.preventDefault()),
                      on<HTMLLabelElement>('dragleave', (event) => {
                        event.preventDefault()
                        event.currentTarget.classList.remove('is-dragging')
                      }),
                      on<HTMLLabelElement>('drop', (event) => {
                        event.preventDefault()
                        event.currentTarget.classList.remove('is-dragging')
                        let file = (event as DragEvent).dataTransfer?.files[0]
                        if (file) void readBookmarkFile(file)
                      }),
                    ]}
                  >
                    <input
                      class="drop-input"
                      type="file"
                      name="bookmarks"
                      accept=".html,text/html"
                      disabled={!library}
                      mix={on<HTMLInputElement>('change', (event) => {
                        let file = event.currentTarget.files?.[0]
                        if (file) void readBookmarkFile(file)
                      })}
                    />
                    <span>Drop a bookmarks file or choose one</span>
                  </label>
                  {bookmarkFolders.length > 0 ? (
                    <div class="home-folder-picker">
                      <label for="bookmark-folder">Folder</label>
                      <div class="home-folder-controls">
                        <span class="home-folder-select">
                          <select
                            id="bookmark-folder"
                            name="bookmark-folder"
                            value={selectedFolderPath ?? ''}
                            mix={on<HTMLSelectElement>('change', (event) => {
                              selectedFolderPath = event.currentTarget.value
                              void handle.update()
                            })}
                          >
                            {bookmarkFolders.map((folder) => (
                              <option value={folder.path}>{folder.path} · {folder.urls.length}</option>
                            ))}
                          </select>
                          <svg
                            viewBox="0 0 8 5"
                            width="8"
                            height="5"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path d="M.5.5 4 4 7.5.5" stroke="currentColor" />
                          </svg>
                        </span>
                        <button
                          class="home-control home-control-secondary"
                          type="button"
                          disabled={working || !library}
                          mix={on<HTMLButtonElement>('click', () => void importBookmarkFolder())}
                        >
                          {pendingAction === 'import-bookmarks' ? 'Saving…' : 'Compare folder'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>

                <form class="home-import-method home-links-form" mix={on<HTMLFormElement>('submit', importPastedUrls)}>
                  <div class="home-method-heading">
                    <label for="urls">Links</label>
                    <span>Two or more</span>
                  </div>
                  <textarea
                    id="urls"
                    name="urls"
                    rows={4}
                    placeholder={'https://example.com\nhttps://another.example'}
                    required
                  ></textarea>
                  <button class="home-control home-submit" type="submit" disabled={working || !library}>
                    {pendingAction === 'import-links' ? 'Saving locally…' : 'Start comparing'}
                  </button>
                </form>

                <section class="home-import-method home-demo-method" aria-labelledby="demo-heading">
                  <div class="home-method-heading">
                    <h2 id="demo-heading">Demo</h2>
                    <span>{demoWebsiteUrls.length} personal sites</span>
                  </div>
                  <button
                    class="home-control home-demo-control"
                    type="button"
                    disabled={working || !library}
                    mix={on<HTMLButtonElement>('click', () => void startDemo())}
                  >
                    {pendingAction === 'open-demo' ? 'Opening…' : 'Open demo'}
                  </button>
                </section>
              </div>
            </section>

            {collections.length > 0 ? (
              <section class="home-library" aria-labelledby="saved-heading">
                <div class="home-library-heading">
                  <h2 id="saved-heading">Saved in this browser</h2>
                </div>
                <div class="home-library-list">
                  {collections.map((saved) => (
                    <a
                      href={routes.collections.show.href({ collectionId: saved.id })}
                      data-rmx-document=""
                    >
                      <span>{saved.name}</span>
                      <span class="home-library-meta">
                        {saved.websiteCount} sites · {saved.comparisonCount} comparisons
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <section class="home-backup" aria-labelledby="backup-heading">
              <div class="home-backup-row">
                <div class="home-backup-copy">
                  <h2 id="backup-heading">Library backup</h2>
                  <p>Move or recover everything saved in this browser.</p>
                </div>
                <div class="home-backup-controls">
                  <button
                    type="button"
                    disabled={!library || collections.length === 0 || working}
                    mix={on<HTMLButtonElement>('click', () => void exportBackup())}
                  >
                    Export backup
                  </button>
                  <label class="home-backup-file">
                    <span>Restore backup</span>
                    <input
                      class="sr-only"
                      type="file"
                      name="backup"
                      accept=".json,application/json"
                      disabled={!library || working}
                      mix={on<HTMLInputElement>('change', (event) => {
                        let file = event.currentTarget.files?.[0]
                        event.currentTarget.value = ''
                        if (file) void readBackupFile(file)
                      })}
                    />
                  </label>
                </div>
              </div>
              {pendingBackup ? (
                <div class="home-backup-confirmation">
                  <p role="status">
                    This backup contains {countLabel(pendingBackup.collections.length, 'collection')} and{' '}
                    {countLabel(pendingBackup.websites.length, 'website')}.{' '}
                    {collections.length > 0
                      ? `Restoring it replaces the ${countLabel(collections.length, 'collection')} currently saved in this browser.`
                      : 'Your browser library is currently empty.'}
                  </p>
                  <div>
                    <button
                      type="button"
                      disabled={working}
                      mix={on<HTMLButtonElement>('click', () => {
                        pendingBackup = null
                        backupError = null
                        void handle.update()
                      })}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      mix={on<HTMLButtonElement>('click', () => void restoreBackup())}
                    >
                      {pendingAction === 'restore-backup'
                        ? 'Restoring…'
                        : collections.length > 0
                          ? 'Replace library'
                          : 'Restore library'}
                    </button>
                  </div>
                </div>
              ) : null}
              {backupError ? <p class="home-backup-message" role="alert">{backupError}</p> : null}
              {backupStatus ? <p class="home-backup-message" role="status">{backupStatus}</p> : null}
            </section>
          </main>
        </div>
      )
    }

    function renderCollection() {
      return (
        <div class="app-shell workspace-shell">
          <main class="workspace-main isolate">
            {loading ? <LoadingPage /> : !collection ? <MissingCollection /> : (
              <>
                <header class="workspace-page-header">
                  <nav class="workspace-context" aria-label="Breadcrumb">
                    <a href={routes.home.href()} data-rmx-document="">← Library</a>
                  </nav>
                  <div class="workspace-heading">
                    <h1>{collection.name}</h1>
                    <div class="workspace-controls" aria-label="Collection actions">
                      <a
                        class="workspace-control-secondary"
                        href={routes.collections.ranking.href({ collectionId: collection.id })}
                        data-rmx-document=""
                      >
                        Ranking
                      </a>
                      <a
                        href={routes.collections.compare.href({ collectionId: collection.id })}
                        data-rmx-document=""
                      >
                        Compare
                      </a>
                    </div>
                  </div>
                </header>
                {error ? <p class="workspace-error" role="alert">{error}</p> : null}
                <div class="workspace-stats-container">
                  <dl class="workspace-stats">
                    <div><dt>Websites</dt><dd>{collection.websiteCount}</dd></div>
                    <div><dt>Available</dt><dd>{collection.availableCount}</dd></div>
                    <div><dt>Unavailable</dt><dd>{collection.unavailableCount}</dd></div>
                    <div><dt>Comparisons</dt><dd>{collection.comparisonCount}</dd></div>
                  </dl>
                </div>
                <div class="workspace-settings">
                  <details>
                    <summary>Rename collection</summary>
                    <form class="compact-form" mix={on<HTMLFormElement>('submit', renameCollection)}>
                      <label class="sr-only" for="collection-name">Collection name</label>
                      <input id="collection-name" name="name" defaultValue={collection.name} maxLength={80} required />
                      <button
                        class="workspace-control workspace-control-secondary"
                        type="submit"
                        disabled={working}
                      >
                        {pendingAction === 'rename-collection' ? 'Saving…' : 'Rename'}
                      </button>
                    </form>
                  </details>
                  <details>
                    <summary>Add websites</summary>
                    <form class="compact-form vertical-form" mix={on<HTMLFormElement>('submit', addWebsites)}>
                      <label class="sr-only" for="additional-urls">Website links</label>
                      <textarea id="additional-urls" name="urls" required></textarea>
                      <button
                        class="workspace-control workspace-control-secondary"
                        type="submit"
                        disabled={working}
                      >
                        {pendingAction === 'add-websites' ? 'Saving…' : 'Add websites'}
                      </button>
                    </form>
                  </details>
                </div>
              </>
            )}
          </main>
        </div>
      )
    }

    function renderRanking() {
      return (
        <div class="app-shell workspace-shell">
          <main class="workspace-main isolate">
            {loading ? <LoadingPage /> : !collection ? <MissingCollection /> : (
              <>
                <header class="workspace-page-header">
                  <nav class="workspace-context" aria-label="Breadcrumb">
                    <a href={routes.home.href()} data-rmx-document="">Library</a>
                    <span aria-hidden="true">/</span>
                    <a
                      href={routes.collections.show.href({ collectionId: collection.id })}
                      data-rmx-document=""
                    >
                      {collection.name}
                    </a>
                  </nav>
                  <div class="workspace-heading">
                    <h1>Ranking</h1>
                    {collection.comparisonCount > 0 ? (
                      <div class="workspace-controls" aria-label="Ranking actions">
                        <a
                          href={routes.collections.compare.href({ collectionId: collection.id })}
                          data-rmx-document=""
                        >
                          Compare
                        </a>
                      </div>
                    ) : null}
                  </div>
                </header>
                {collection.comparisonCount === 0 ? (
                  <div class="workspace-state ranking-empty-state">
                    <h2>No ranking yet</h2>
                    <p>Your first choice will start turning this collection into a personal ranking.</p>
                    <a
                      class="workspace-control"
                      href={routes.collections.compare.href({ collectionId: collection.id })}
                      data-rmx-document=""
                    >
                      Start comparing
                    </a>
                  </div>
                ) : (
                  <div class="table-scroll">
                    <div class="table-inner">
                      <table class="ranking-table">
                        <thead>
                          <tr>
                            <th class="numeric-heading"><span class="sr-only">Position</span><span aria-hidden="true">#</span></th>
                            <th>Website</th>
                            <th class="numeric-heading">Score</th>
                            <th class="numeric-heading comparison-column">Comparisons</th>
                            <th><span class="sr-only">Open</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranking.map((website, index) => (
                            <tr class={website.status === 'unavailable' ? 'is-unavailable' : undefined}>
                              <td class="rank-position">{index + 1}</td>
                              <td>
                                <div class="site-cell">
                                  <span class="site-copy">
                                    <span class="site-title">{website.title ?? website.domain}</span>
                                    <span class="site-domain">
                                      {website.domain}{website.status === 'unavailable' ? ' · unavailable' : ''}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              <td class="numeric-cell">{website.rating}</td>
                              <td class="numeric-cell comparison-column">{website.comparisons}</td>
                              <td class="open-cell">
                                <a href={website.normalizedUrl} target="_blank" rel="noreferrer">Open</a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )
    }

    function renderComparisonState(content: RemixNode) {
      return (
        <div class="app-shell workspace-shell">
          <main class="workspace-main isolate">{content}</main>
        </div>
      )
    }

    function renderComparison() {
      if (loading) {
        return renderComparisonState(
          <div class="workspace-state loading-page" aria-live="polite">
            <p>Opening your local library…</p>
          </div>,
        )
      }
      if (!collection) {
        return renderComparisonState(
          <div class="workspace-state">
            <h1>{error ? 'Comparison could not be opened' : 'Collection not found'}</h1>
            {error ? (
              <p role="alert">{error}</p>
            ) : (
              <p>It may have been created in another browser or cleared from this one.</p>
            )}
            <a class="workspace-control" href={routes.home.href()} data-rmx-document="">
              Return home
            </a>
          </div>,
        )
      }
      if (!comparisonViewportSupported) {
        return renderComparisonState(
          <div class="workspace-state comparison-width-state">
            <h1>Comparison needs a wider window</h1>
            <p>
              Use a window at least 640 pixels wide to compare two websites. Your collection and
              ranking are still available here.
            </p>
            {error ? <p role="alert">{error}</p> : null}
            <div class="workspace-state-actions">
              <a
                class="workspace-state-link"
                href={routes.collections.show.href({ collectionId: collection.id })}
                data-rmx-document=""
              >
                View collection
              </a>
              <a
                class="workspace-state-link"
                href={routes.collections.ranking.href({ collectionId: collection.id })}
                data-rmx-document=""
              >
                View ranking
              </a>
            </div>
          </div>,
        )
      }
      if (!pair) {
        return renderComparisonState(
          <div class="workspace-state">
            <h1>Two available sites are needed</h1>
            {error ? (
              <p role="alert">{error}</p>
            ) : (
              <p>
                {undoAvailable
                  ? 'Undo the last action or return to the collection to add more websites.'
                  : 'Return to the collection to add more websites.'}
              </p>
            )}
            <div class="workspace-state-actions">
              {undoAvailable ? (
                <button
                  class="workspace-control"
                  type="button"
                  disabled={working}
                  aria-keyshortcuts="u"
                  mix={on<HTMLButtonElement>('click', () => void undoLastComparisonAction())}
                >
                  Undo last action
                </button>
              ) : null}
              <a
                class="workspace-state-link"
                href={routes.collections.show.href({ collectionId: collection.id })}
                data-rmx-document=""
              >
                View collection
              </a>
              <a
                class="workspace-state-link"
                href={routes.collections.ranking.href({ collectionId: collection.id })}
                data-rmx-document=""
              >
                View ranking
              </a>
            </div>
          </div>,
        )
      }

      let visiblePair = orientPair(pair, sidesSwapped)
      let visibleSideLoading = {
        left: !pairLoading && !loadedSides.has(sidesSwapped ? 'right' : 'left'),
        right: !pairLoading && !loadedSides.has(sidesSwapped ? 'left' : 'right'),
      }

      return (
        <main
          class={`comparison-stage isolate${pairLoading ? ' is-loading' : ''}`}
          style={{ '--divider': `${dividerPercent}%` }}
          tabIndex={-1}
          data-comparison
        >
          <div
            class={`site-layer ${sidesSwapped ? 'site-layer-right' : 'site-layer-left'}${loadedSides.has('left') ? '' : ' is-frame-loading'}`}
          >
            <span class="site-layer-spinner" aria-hidden="true"></span>
            <iframe
              key={`left-${pair.id}`}
              title={`${sidesSwapped ? 'Right' : 'Left'}: ${pair.left.domain}`}
              src={pair.left.url}
              referrerPolicy="no-referrer"
              mix={on<HTMLIFrameElement>('load', () => frameLoaded('left'))}
            ></iframe>
          </div>
          <div
            class={`site-layer ${sidesSwapped ? 'site-layer-left' : 'site-layer-right'}${loadedSides.has('right') ? '' : ' is-frame-loading'}`}
          >
            <span class="site-layer-spinner" aria-hidden="true"></span>
            <iframe
              key={`right-${pair.id}`}
              title={`${sidesSwapped ? 'Left' : 'Right'}: ${pair.right.domain}`}
              src={pair.right.url}
              referrerPolicy="no-referrer"
              mix={on<HTMLIFrameElement>('load', () => frameLoaded('right'))}
            ></iframe>
          </div>
          <div class="comparison-loading">
            <span></span><p>Preparing comparison</p>
          </div>
          <div
            class="divider"
            data-divider
            aria-hidden="true"
            mix={[
              on<HTMLDivElement>('pointerdown', dividerPointerDown),
              on<HTMLDivElement>('pointermove', dividerPointerMove),
              on<HTMLDivElement>('pointerup', dividerPointerUp),
              on<HTMLDivElement>('pointercancel', dividerPointerUp),
              on<HTMLDivElement>('dblclick', () => setDivider(50)),
            ]}
          >
            <span class="divider-line"></span><span class="divider-handle"></span>
          </div>
          <a
            class="comparison-context"
            href={routes.collections.show.href({ collectionId: collection.id })}
            data-rmx-document=""
          >
            <span aria-hidden="true">←</span>
            <span class="comparison-context-name">{collection.name}</span>
            <span class="comparison-context-count">
              {countLabel(collection.comparisonCount, 'comparison')}
            </span>
          </a>
          <div class="comparison-dock">
            <div class={`comparison-hint${error ? ' is-error' : ''}`}>
              <p role={error ? 'alert' : 'status'}>
                {error
                  ? error
                  : keyboardPaused
                    ? 'Click the divider to use keys'
                    : swapAcknowledgement
                      ? 'Sides switched'
                      : comparisonNotice ?? 'Drag the divider to inspect both sites'}
              </p>
              {undoAvailable && comparisonNotice ? (
                <button
                  type="button"
                  disabled={working}
                  aria-keyshortcuts="u"
                  mix={on<HTMLButtonElement>('click', () => void undoLastComparisonAction())}
                >
                  <span>Undo</span>
                  <kbd class="shortcut-key" aria-hidden="true">U</kbd>
                </button>
              ) : null}
            </div>
            <div class="comparison-choices" aria-label="Choose a website">
              <button type="button" disabled={working} aria-keyshortcuts="ArrowLeft" mix={on<HTMLButtonElement>('click', () => void submitChoice('left'))}>
                <span>Left</span><kbd class="shortcut-key" aria-hidden="true">←</kbd>
              </button>
              <button type="button" disabled={working} aria-keyshortcuts="s" mix={on<HTMLButtonElement>('click', swapSides)}>
                <span>Swap</span><kbd class="shortcut-key" aria-hidden="true">S</kbd>
              </button>
              <button type="button" disabled={working} aria-keyshortcuts="ArrowDown" mix={on<HTMLButtonElement>('click', () => void submitChoice('skip'))}>
                <span>Skip</span><kbd class="shortcut-key" aria-hidden="true">↓</kbd>
              </button>
              <button type="button" disabled={working} aria-keyshortcuts="ArrowRight" mix={on<HTMLButtonElement>('click', () => void submitChoice('right'))}>
                <span>Right</span><kbd class="shortcut-key" aria-hidden="true">→</kbd>
              </button>
            </div>
          </div>
          <div class="site-status site-status-left">
            <a href={visiblePair.left.url} target="_blank" rel="noreferrer">
              {visibleSideLoading.left ? (
                <span class="site-status-spinner" role="status" aria-label="Still loading"></span>
              ) : null}
              {visiblePair.left.domain}
            </a>
            <button
              type="button"
              disabled={working}
              aria-label={`Mark ${visiblePair.left.domain} as unavailable`}
              aria-keyshortcuts="z"
              mix={on<HTMLButtonElement>('click', () => markVisibleSideUnavailable('left'))}
            >
              <span>Didn’t load?</span>
              <kbd class="shortcut-key" aria-hidden="true">Z</kbd>
            </button>
          </div>
          <div class="site-status site-status-right">
            <a href={visiblePair.right.url} target="_blank" rel="noreferrer">
              {visibleSideLoading.right ? (
                <span class="site-status-spinner" role="status" aria-label="Still loading"></span>
              ) : null}
              {visiblePair.right.domain}
            </a>
            <button
              type="button"
              disabled={working}
              aria-label={`Mark ${visiblePair.right.domain} as unavailable`}
              aria-keyshortcuts="x"
              mix={on<HTMLButtonElement>('click', () => markVisibleSideUnavailable('right'))}
            >
              <span>Didn’t load?</span>
              <kbd class="shortcut-key" aria-hidden="true">X</kbd>
            </button>
          </div>
          <div class={`vote-feedback${feedbackChoice ? ` is-visible feedback-${feedbackChoice}` : ''}`}></div>
        </main>
      )
    }

    return () => {
      if (handle.props.page === 'home') return renderHome()
      if (handle.props.page === 'collection') return renderCollection()
      if (handle.props.page === 'ranking') return renderRanking()
      return renderComparison()
    }
  },
)

function LoadingPage() {
  return () => (
    <div class="workspace-state loading-page" aria-live="polite">
      <p>Opening your local library…</p>
    </div>
  )
}

function MissingCollection() {
  return () => (
    <div class="workspace-state">
      <h1>Collection not found</h1>
      <p>It may have been created in another browser or cleared from this one.</p>
      <a class="workspace-control" href={routes.home.href()} data-rmx-document="">Return home</a>
    </div>
  )
}

async function requestPersistentStorage() {
  try {
    await navigator.storage?.persist?.()
  } catch {
    // Persistence is a browser policy decision; the collection is already saved.
  }
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
