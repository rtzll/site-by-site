import {
  clientEntry,
  on,
  type Handle,
  type SerializableProps,
} from 'remix/ui'

import {
  openLocalLibrary,
  type CollectionSummary,
  type ComparisonPair,
  type LocalLibrary,
  type VoteChoice,
  type WebsiteRecord,
} from '../data/local-library.ts'
import { routes } from '../routes.ts'
import { orientPair, translateVisibleChoice } from '../services/pair-orientation.ts'
import { AppHeader } from '../ui/app-header.tsx'
import { parseBookmarkHtml, type BookmarkFolder } from '../utils/bookmarks.ts'
import { extractUrls } from '../utils/urls.ts'

export type AppPageKind = 'home' | 'collection' | 'compare' | 'ranking'
export const SiteBySiteEntryId = 'SiteBySiteApp'

interface SiteBySiteAppProps extends SerializableProps {
  page: AppPageKind
  collectionId?: string
}

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
    let error: string | null = null
    let bookmarkFolders: BookmarkFolder[] = []
    let selectedFolderPath: string | null = null
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
    let initialized = false

    if (typeof window !== 'undefined') {
      handle.queueTask(() => {
        if (initialized) return
        initialized = true
        installComparisonControls()
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
        if (handle.props.page === 'compare' && pair) focusDivider()
      }
    }

    function installComparisonControls() {
      if (handle.props.page !== 'compare') return

      let onKeyDown = (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey || event.altKey || working || event.repeat) return
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
      error = null
      await handle.update()
      try {
        let created = await library.createCollection({ sourceType: 'paste', websites: urls })
        await requestPersistentStorage()
        window.location.assign(routes.collections.compare.href({ collectionId: created.id }))
      } catch (caught) {
        working = false
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
      error = null
      await handle.update()
      try {
        let created = await library.createCollection({
          name: folder.name,
          sourceType: 'bookmarks',
          websites,
        })
        await requestPersistentStorage()
        window.location.assign(routes.collections.compare.href({ collectionId: created.id }))
      } catch (caught) {
        working = false
        error = messageFrom(caught, 'The bookmarks could not be saved.')
        await handle.update()
      }
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
      await handle.update()
      collection = await library.addWebsites(collection.id, websites)
      working = false
      error = null
      form.reset()
      await handle.update()
    }

    async function renameCollection(event: Event) {
      event.preventDefault()
      if (!library || !collection) return
      let form = event.currentTarget as HTMLFormElement
      let name = String(new FormData(form).get('name') ?? '')
      collection = await library.renameCollection(collection.id, name)
      await handle.update()
    }

    async function submitChoice(choice: VoteChoice) {
      if (!library || !collection || !pair || working) return
      working = true
      feedbackChoice = choice
      keyboardPaused = false
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
      } catch (caught) {
        feedbackChoice = null
        error = messageFrom(caught, 'That choice could not be saved.')
      } finally {
        working = false
        await handle.update()
        if (pair) focusDivider()
      }
    }

    async function markUnavailable(websiteId: string) {
      if (!library || !collection || !pair || working) return
      working = true
      pairLoading = true
      await handle.update()
      try {
        pair = await library.markSiteUnavailable({
          collectionId: collection.id,
          pairId: pair.id,
          websiteId,
        })
        collection = await library.getCollection(collection.id)
        preparePair()
      } catch (caught) {
        error = messageFrom(caught, 'That site could not be marked unavailable.')
      } finally {
        working = false
        await handle.update()
        if (pair) focusDivider()
      }
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
      if (loadedSides.size === 2) {
        pairLoading = false
        void handle.update()
      }
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
      void handle.update().then(focusDivider)
      window.setTimeout(() => {
        if (pair?.id !== pairId || swapAcknowledgementVersion !== acknowledgementVersion) return
        swapAcknowledgement = false
        void handle.update()
      }, 1_000)
    }

    function dividerPointerDown(event: Event) {
      let pointerEvent = event as PointerEvent
      let divider = event.currentTarget as HTMLButtonElement
      divider.focus({ preventScroll: true })
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
      let divider = event.currentTarget as HTMLButtonElement
      if (divider.hasPointerCapture(pointerEvent.pointerId)) {
        divider.releasePointerCapture(pointerEvent.pointerId)
      }
      void handle.update()
    }

    function focusDivider() {
      window.setTimeout(() => {
        document.querySelector<HTMLButtonElement>('[data-divider]')?.focus({ preventScroll: true })
      })
    }

    async function exportBackup() {
      if (!library) return
      let backup = await library.exportData()
      let url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      )
      let link = document.createElement('a')
      link.href = url
      link.download = `site-by-site-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    }

    function renderHome() {
      return (
        <div class="app-shell home-shell">
          <AppHeader />
          <main class="home-main isolate">
            <section class="home-entry" aria-labelledby="home-heading">
              <h1 class="sr-only" id="home-heading">Compare websites side by side</h1>
              <p class="home-summary">
                Add bookmarks or paste links to compare websites side by side—everything stays in this browser.
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
                        <button
                          class="home-control"
                          type="button"
                          disabled={working || !library}
                          mix={on<HTMLButtonElement>('click', () => void importBookmarkFolder())}
                        >
                          {working ? 'Saving…' : 'Compare folder'}
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
                    {working ? 'Saving locally…' : 'Start comparing'}
                  </button>
                </form>
              </div>
            </section>

            {collections.length > 0 ? (
              <section class="home-library" aria-labelledby="saved-heading">
                <div class="home-library-heading">
                  <h2 id="saved-heading">Saved in this browser</h2>
                  <button type="button" mix={on<HTMLButtonElement>('click', () => void exportBackup())}>
                    Download backup
                  </button>
                </div>
                <div class="home-library-list">
                  {collections.map((saved) => (
                    <a
                      href={routes.collections.show.href({ collectionId: saved.id })}
                      rmx-document=""
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
          </main>
        </div>
      )
    }

    function renderCollection() {
      return (
        <div class="app-shell workspace-shell">
          <AppHeader collectionId={collection?.id} />
          <main class="workspace-main isolate">
            {loading ? <LoadingPage /> : !collection ? <MissingCollection /> : (
              <>
                <div class="workspace-heading">
                  <h1>{collection.name}</h1>
                  <div class="workspace-controls" aria-label="Collection actions">
                    <a href={routes.collections.compare.href({ collectionId: collection.id })}>
                      Compare
                    </a>
                    <button type="button" mix={on<HTMLButtonElement>('click', () => void exportBackup())}>
                      Download backup
                    </button>
                  </div>
                </div>
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
                      <button class="workspace-control" type="submit">Rename</button>
                    </form>
                  </details>
                  <details>
                    <summary>Add websites</summary>
                    <form class="compact-form vertical-form" mix={on<HTMLFormElement>('submit', addWebsites)}>
                      <label class="sr-only" for="additional-urls">Website links</label>
                      <textarea id="additional-urls" name="urls" required></textarea>
                      <button class="workspace-control" type="submit" disabled={working}>
                        {working ? 'Saving…' : 'Add websites'}
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
          <AppHeader collectionId={collection?.id} />
          <main class="workspace-main isolate">
            {loading ? <LoadingPage /> : !collection ? <MissingCollection /> : (
              <>
                <div class="workspace-heading">
                  <h1>{collection.name}</h1>
                  <div class="workspace-controls" aria-label="Ranking actions">
                    <a href={routes.collections.compare.href({ collectionId: collection.id })}>
                      Compare
                    </a>
                  </div>
                </div>
                <div class="table-scroll">
                  <div class="table-inner">
                    <table class="ranking-table">
                      <thead>
                        <tr><th>Position</th><th>Website</th><th>Score</th><th>Comparisons</th><th><span class="sr-only">Open</span></th></tr>
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
                            <td class="numeric-cell">{website.comparisons}</td>
                            <td class="open-cell">
                              <a href={website.normalizedUrl} target="_blank" rel="noreferrer">Open</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      )
    }

    function renderComparison() {
      if (loading) {
        return <div class="comparison-empty"><p>Opening your local library…</p></div>
      }
      if (!collection) {
        return (
          <div class="comparison-empty">
            <p class="eyebrow">Only in this browser</p>
            <h1>Collection not found.</h1>
            <a class="workspace-control" href={routes.home.href()}>Return home</a>
          </div>
        )
      }
      if (!pair) {
        return (
          <div class="comparison-empty">
            <p class="eyebrow">Comparison paused</p>
            <h1>Two available sites are needed.</h1>
            <p>Return to the collection to add more websites.</p>
            <a class="workspace-control" href={routes.collections.show.href({ collectionId: collection.id })}>
              View collection
            </a>
          </div>
        )
      }

      let visiblePair = orientPair(pair, sidesSwapped)

      return (
        <main
          class={`comparison-stage isolate${pairLoading ? ' is-loading' : ''}`}
          style={{ '--divider': `${dividerPercent}%` }}
          data-comparison
        >
          <div class={`site-layer ${sidesSwapped ? 'site-layer-right' : 'site-layer-left'}`}>
            <iframe
              key={`left-${pair.id}`}
              title={`${sidesSwapped ? 'Right' : 'Left'}: ${pair.left.domain}`}
              src={pair.left.url}
              referrerPolicy="no-referrer"
              mix={on<HTMLIFrameElement>('load', () => frameLoaded('left'))}
            ></iframe>
          </div>
          <div class={`site-layer ${sidesSwapped ? 'site-layer-left' : 'site-layer-right'}`}>
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
          <button
            class="divider"
            type="button"
            data-divider
            aria-label="Drag to inspect both websites"
            mix={[
              on<HTMLButtonElement>('pointerdown', dividerPointerDown),
              on<HTMLButtonElement>('pointermove', dividerPointerMove),
              on<HTMLButtonElement>('pointerup', dividerPointerUp),
              on<HTMLButtonElement>('pointercancel', dividerPointerUp),
              on<HTMLButtonElement>('dblclick', () => setDivider(50)),
            ]}
          >
            <span class="divider-line"></span><span class="divider-handle"></span>
          </button>
          <div class="comparison-dock">
            <p class="comparison-hint" role="status">
              {keyboardPaused
                ? 'Click the divider to use keys'
                : swapAcknowledgement
                  ? 'Sides switched'
                  : 'Drag the divider to inspect both sites'}
            </p>
            <div class="comparison-choices" aria-label="Choose a website">
              <button type="button" disabled={working} aria-keyshortcuts="ArrowLeft" mix={on<HTMLButtonElement>('click', () => void submitChoice('left'))}>[←] Left</button>
              <button type="button" disabled={working} aria-keyshortcuts="s" mix={on<HTMLButtonElement>('click', swapSides)}>[s] Swap</button>
              <button type="button" disabled={working} aria-keyshortcuts="ArrowDown" mix={on<HTMLButtonElement>('click', () => void submitChoice('skip'))}>[↓] Skip</button>
              <button type="button" disabled={working} aria-keyshortcuts="ArrowRight" mix={on<HTMLButtonElement>('click', () => void submitChoice('right'))}>[→] Right</button>
            </div>
          </div>
          <div class="site-status site-status-left">
            <a href={visiblePair.left.url} target="_blank" rel="noreferrer">{visiblePair.left.domain}</a>
            <button
              type="button"
              disabled={working}
              aria-label={`Mark ${visiblePair.left.domain} as unavailable`}
              aria-keyshortcuts="z"
              mix={on<HTMLButtonElement>('click', () => markVisibleSideUnavailable('left'))}
            >
              [z] Didn’t load?
            </button>
          </div>
          <div class="site-status site-status-right">
            <a href={visiblePair.right.url} target="_blank" rel="noreferrer">{visiblePair.right.domain}</a>
            <button
              type="button"
              disabled={working}
              aria-label={`Mark ${visiblePair.right.domain} as unavailable`}
              aria-keyshortcuts="x"
              mix={on<HTMLButtonElement>('click', () => markVisibleSideUnavailable('right'))}
            >
              [x] Didn’t load?
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
      <a class="workspace-control" href={routes.home.href()}>Return home</a>
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

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
