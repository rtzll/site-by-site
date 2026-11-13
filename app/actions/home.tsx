import type { Handle } from 'remix/component'

import { SiteBySiteApp, type AppPageKind } from '../assets/site-by-site.tsx'
import { Document } from '../ui/document.tsx'

export function AppPage(handle: Handle<{ page: AppPageKind; collectionId?: string }>) {
  let bodyClass =
    handle.props.page === 'compare'
      ? 'comparison-body'
      : handle.props.page === 'home'
        ? 'home-body'
        : 'workspace-body'

  return () => (
    <Document title={titleFor(handle.props.page)} bodyClass={bodyClass}>
      <SiteBySiteApp page={handle.props.page} collectionId={handle.props.collectionId} />
    </Document>
  )
}

function titleFor(page: AppPageKind): string {
  if (page === 'home') return 'Site by Site · Rank website inspiration'
  if (page === 'ranking') return 'Ranking · Site by Site'
  if (page === 'compare') return 'Compare · Site by Site'
  return 'Collection · Site by Site'
}
