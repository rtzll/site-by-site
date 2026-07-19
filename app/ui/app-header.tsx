import type { Handle } from 'remix/ui'

import { routes } from '../routes.ts'

export function AppHeader(
  handle: Handle<{ collectionId?: string; currentPage?: 'collection' | 'ranking' }>,
) {
  return () => (
    <header class="app-header">
      <a class="wordmark" href={routes.home.href()} aria-label="Homepage" rmx-document="">
        Site by Site
      </a>
      {handle.props.collectionId ? (
        <>
          <nav class="header-actions header-actions-desktop" aria-label="Collection">
            <a
              href={routes.collections.show.href({ collectionId: handle.props.collectionId })}
              aria-current={handle.props.currentPage === 'collection' ? 'page' : undefined}
              rmx-document=""
            >
              Collection
            </a>
            <a
              href={routes.collections.ranking.href({ collectionId: handle.props.collectionId })}
              aria-current={handle.props.currentPage === 'ranking' ? 'page' : undefined}
              rmx-document=""
            >
              Ranking
            </a>
          </nav>
          <details class="header-menu">
            <summary>
              <span>Menu</span>
              <span class="header-menu-indicator-closed" aria-hidden="true">+</span>
              <span class="header-menu-indicator-open" aria-hidden="true">−</span>
            </summary>
            <nav aria-label="Collection">
              <a
                href={routes.collections.show.href({ collectionId: handle.props.collectionId })}
                aria-current={handle.props.currentPage === 'collection' ? 'page' : undefined}
                rmx-document=""
              >
                Collection
              </a>
              <a
                href={routes.collections.ranking.href({ collectionId: handle.props.collectionId })}
                aria-current={handle.props.currentPage === 'ranking' ? 'page' : undefined}
                rmx-document=""
              >
                Ranking
              </a>
            </nav>
          </details>
        </>
      ) : null}
    </header>
  )
}
