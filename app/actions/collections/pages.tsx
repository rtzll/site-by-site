import type { Handle } from 'remix/ui'

import type { CollectionSummary, ImportProgress, WebsiteRecord } from '../../data/store.ts'
import { routes } from '../../routes.ts'
import { AppHeader } from '../../ui/app-header.tsx'
import { Document } from '../../ui/document.tsx'
import type { BookmarkFolder } from '../../utils/bookmarks.ts'
import type { ComparisonPair } from '../../services/backlog.ts'

export function BookmarkSelectionPage(
  handle: Handle<{ jobId: string; folders: BookmarkFolder[]; error?: string }>,
) {
  return () => (
    <Document title="Choose a bookmark folder · Site by Site">
      <div class="app-shell">
        <AppHeader />
        <main class="page-main isolate narrow-page">
          <div class="page-heading">
            <p class="eyebrow">Bookmark import</p>
            <h1>Choose a folder.</h1>
            <p>Links in nested folders are included in their parent folder count.</p>
          </div>
          {handle.props.error ? <p class="form-error" role="alert">{handle.props.error}</p> : null}
          <form class="folder-form" method="post" action={routes.collections.confirmBookmarks.href()}>
            <input type="hidden" name="job_id" value={handle.props.jobId} />
            <div class="folder-list" role="radiogroup" aria-label="Bookmark folder">
              {handle.props.folders.map((folder, index) => (
                <label class="folder-option">
                  <input
                    type="radio"
                    name="folder_path"
                    value={folder.path}
                    checked={index === 0}
                    disabled={folder.urls.length === 0}
                  />
                  <span class="folder-copy">
                    <span class="folder-name">{folder.path}</span>
                    <span class="folder-count">{folder.urls.length} {folder.urls.length === 1 ? 'site' : 'sites'}</span>
                  </span>
                </label>
              ))}
            </div>
            <div class="field-stack">
              <label for="bookmark-collection-name">Collection name</label>
              <input
                id="bookmark-collection-name"
                name="name"
                type="text"
                value={handle.props.folders.find((folder) => folder.urls.length > 0)?.name ?? 'Imported bookmarks'}
                maxLength={80}
                required
              />
            </div>
            <button class="button button-primary" type="submit">Import this folder</button>
          </form>
        </main>
      </div>
    </Document>
  )
}

export function CollectionPage(
  handle: Handle<{ collection: CollectionSummary; notice?: string; error?: string }>,
) {
  return () => {
    let { collection } = handle.props
    return (
      <Document title={`${collection.name} · Site by Site`}>
        <div class="app-shell">
          <AppHeader collectionId={collection.id} collectionName={collection.name} />
          <main class="page-main isolate">
            <div class="page-heading collection-heading">
              <p class="eyebrow">Collection</p>
              <h1>{collection.name}</h1>
              <p>Your ordered reference library becomes clearer with every comparison.</p>
            </div>
            {handle.props.notice ? <p class="notice" role="status">{handle.props.notice}</p> : null}
            {handle.props.error ? <p class="form-error" role="alert">{handle.props.error}</p> : null}

            <dl class="stats-row">
              <div><dt>Websites</dt><dd>{collection.websiteCount}</dd></div>
              <div><dt>Ready</dt><dd>{collection.availableCount}</dd></div>
              <div><dt>Unavailable</dt><dd>{collection.unavailableCount}</dd></div>
              <div><dt>Comparisons</dt><dd>{collection.comparisonCount}</dd></div>
            </dl>

            <div class="collection-actions">
              <a class="button button-primary" href={routes.collections.compare.href({ collectionId: collection.id })}>
                Continue comparing
              </a>
              <a class="button button-secondary" href={routes.collections.ranking.href({ collectionId: collection.id })}>
                View ranking
              </a>
            </div>

            <details class="add-sites">
              <summary>Add websites</summary>
              <form method="post" action={routes.collections.addSites.href({ collectionId: collection.id })}>
                <div class="field-stack">
                  <label for="additional-urls">More URLs</label>
                  <textarea id="additional-urls" name="urls" required></textarea>
                </div>
                <button class="button button-secondary button-small" type="submit">Add and check</button>
              </form>
            </details>
          </main>
        </div>
      </Document>
    )
  }
}

export function PreparationPage(
  handle: Handle<{ collection: CollectionSummary; progress: ImportProgress }>,
) {
  return () => {
    let { collection, progress } = handle.props
    let complete = progress.checking === 0
    return (
      <Document title={`Preparing ${collection.name} · Site by Site`}>
        <div class="app-shell">
          <AppHeader collectionId={collection.id} collectionName={collection.name} />
          <main
            class="page-main isolate preparation-page"
            data-preparation
            data-progress-url={routes.collections.progress.href({ collectionId: collection.id })}
            data-compare-url={routes.collections.compare.href({ collectionId: collection.id })}
            data-collection-url={routes.collections.show.href({ collectionId: collection.id })}
          >
            <div class="page-heading">
              <p class="eyebrow">Preparing collection</p>
              <h1 data-preparation-title>{complete ? 'Your collection is ready.' : 'Checking every site.'}</h1>
              <p data-preparation-copy>
                {complete
                  ? 'Likely embeddable sites are ready for comparison.'
                  : 'We follow redirects and inspect each site before it enters a comparison.'}
              </p>
            </div>
            <div class="progress-track" aria-hidden="true"><span data-progress-bar></span></div>
            <dl class="stats-row preparation-stats" aria-live="polite">
              <div><dt>Found</dt><dd data-count="found">{progress.found}</dd></div>
              <div><dt>Ready</dt><dd data-count="ready">{progress.ready}</dd></div>
              <div><dt>Checking</dt><dd data-count="checking">{progress.checking}</dd></div>
              <div><dt>Unavailable</dt><dd data-count="unavailable">{progress.unavailable}</dd></div>
            </dl>
            <p class="preparation-note" data-preparation-note>
              Unavailable sites stay in the collection for future snapshot support.
            </p>
            <div class={`collection-actions preparation-actions${complete ? '' : ' is-hidden'}`} data-preparation-actions>
              <a class="button button-primary" data-compare-link href={routes.collections.compare.href({ collectionId: collection.id })}>
                Start comparing
              </a>
              <a class="button button-secondary" href={routes.collections.show.href({ collectionId: collection.id })}>
                View collection
              </a>
            </div>
          </main>
        </div>
      </Document>
    )
  }
}

export function RankingPage(
  handle: Handle<{ collection: CollectionSummary; websites: WebsiteRecord[] }>,
) {
  return () => {
    let { collection, websites } = handle.props
    return (
      <Document title={`${collection.name} ranking · Site by Site`}>
        <div class="app-shell">
          <AppHeader collectionId={collection.id} collectionName={collection.name} />
          <main class="page-main isolate">
            <div class="page-heading ranking-heading">
              <p class="eyebrow">Current ranking</p>
              <h1>{collection.name}</h1>
              <p>The order matters more than the score. Keep comparing to sharpen it.</p>
            </div>
            <div class="ranking-actions">
              <a class="button button-primary" href={routes.collections.compare.href({ collectionId: collection.id })}>
                Continue comparing
              </a>
            </div>
            <div class="table-scroll">
              <div class="table-inner">
                <table class="ranking-table">
                  <thead>
                    <tr><th>Position</th><th>Website</th><th>Score</th><th>Comparisons</th><th><span class="sr-only">Open</span></th></tr>
                  </thead>
                  <tbody>
                    {websites.map((website, index) => (
                      <tr>
                        <td class="rank-position">{index + 1}</td>
                        <td>
                          <div class="site-cell">
                            <span class="thumbnail-placeholder">{website.domain.slice(0, 1).toUpperCase()}</span>
                            <span class="site-copy">
                              <span class="site-title">{website.title ?? website.domain}</span>
                              <span class="site-domain">{website.domain}</span>
                            </span>
                          </div>
                        </td>
                        <td class="numeric-cell">{website.rating}</td>
                        <td class="numeric-cell">{website.comparisons}</td>
                        <td class="open-cell"><a href={website.finalUrl ?? website.normalizedUrl} target="_blank" rel="noreferrer">Open</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        </div>
      </Document>
    )
  }
}

export function ComparisonPage(
  handle: Handle<{
    collection: CollectionSummary
    pair: ComparisonPair | null
    preloads: ComparisonPair[]
  }>,
) {
  return () => {
    let { collection, pair, preloads } = handle.props
    if (!pair) {
      return (
        <Document title={`${collection.name} · Site by Site`}>
          <div class="app-shell">
            <AppHeader collectionId={collection.id} collectionName={collection.name} />
            <main class="page-main isolate narrow-page">
              <div class="page-heading">
                <p class="eyebrow">Comparison paused</p>
                <h1>Two ready sites are needed.</h1>
                <p>Add more websites or review which sites were unavailable.</p>
              </div>
              <div class="collection-actions">
                <a class="button button-primary" href={routes.collections.show.href({ collectionId: collection.id })}>View collection</a>
              </div>
            </main>
          </div>
        </Document>
      )
    }

    return (
      <Document title={`Compare · ${collection.name}`} bodyClass="comparison-body">
        <main
          class="comparison-stage isolate is-loading"
          data-comparison
          data-pair={JSON.stringify(pair)}
          data-preloads={JSON.stringify(preloads)}
          data-vote-url={routes.collections.vote.href({ collectionId: collection.id })}
          data-runtime-url={routes.collections.runtimeFailed.href({ collectionId: collection.id })}
          data-ranking-url={routes.collections.ranking.href({ collectionId: collection.id })}
        >
          <div class="site-layer site-layer-left" data-layer="left">
            <iframe data-site-frame="left" title={`Left: ${pair.left.domain}`} src="about:blank"></iframe>
          </div>
          <div class="site-layer site-layer-right" data-layer="right">
            <iframe data-site-frame="right" title={`Right: ${pair.right.domain}`} src="about:blank"></iframe>
          </div>
          <div class="comparison-loading" data-comparison-loading>
            <span></span><p>Preparing comparison</p>
          </div>
          <button class="divider" type="button" data-divider aria-label="Drag to inspect both websites">
            <span class="divider-line"></span><span class="divider-handle"></span>
          </button>
          <div class="comparison-instruction" data-instruction>Drag to inspect · ← or → to choose · ↓ to skip</div>
          <a class="domain-label domain-left" data-domain="left" href={pair.left.url} target="_blank" rel="noreferrer">{pair.left.domain}</a>
          <a class="domain-label domain-right" data-domain="right" href={pair.right.url} target="_blank" rel="noreferrer">{pair.right.domain}</a>
          <div class="vote-feedback" data-vote-feedback></div>
          <div class="preload-pool" data-preload-pool aria-hidden="true"></div>
        </main>
      </Document>
    )
  }
}
