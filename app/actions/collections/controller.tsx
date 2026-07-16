import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import {
  addWebsites,
  createBookmarkSelectionJob,
  createCollectionWithImport,
  getBookmarkSelectionJob,
  getCollectionSummary,
  getLatestImportProgress,
  getRankedWebsites,
  syncImportProgress,
} from '../../data/store.ts'
import {
  fillBacklog,
  getOrActivateCurrentPair,
  getPreparedPairPreviews,
  markRuntimeFailed,
  recordVote,
  type ComparisonPair,
  type VoteChoice,
} from '../../services/backlog.ts'
import { processPendingChecks } from '../../services/import-jobs.ts'
import { routes } from '../../routes.ts'
import { parseBookmarkHtml } from '../../utils/bookmarks.ts'
import { extractUrls } from '../../utils/urls.ts'
import { HomePage } from '../home.tsx'
import {
  BookmarkSelectionPage,
  CollectionPage,
  ComparisonPage,
  PreparationPage,
  RankingPage,
} from './pages.tsx'

export default createController(routes.collections, {
  actions: {
    create({ get, render }) {
      let formData = get(FormData)
      let name = readText(formData, 'name')
      let importedUrls = extractUrls(readText(formData, 'urls'))
      if (!name || importedUrls.length === 0) {
        return render(<HomePage error="Add a collection name and at least one valid website URL." />, { status: 400 })
      }

      let { collectionId } = createCollectionWithImport(name.slice(0, 80), 'paste', importedUrls)
      return redirect(routes.collections.prepare.href({ collectionId }), 303)
    },

    async inspectBookmarks({ get, render }) {
      let file = get(FormData).get('bookmarks')
      if (!(file instanceof File) || file.size === 0) {
        return render(<HomePage error="Choose a browser-exported bookmarks HTML file." />, { status: 400 })
      }
      if (file.size > 2_000_000) {
        return render(<HomePage error="That bookmarks file is larger than 2 MB." />, { status: 400 })
      }

      let folders = parseBookmarkHtml(await file.text())
      if (folders.length === 0 || folders.every((folder) => folder.urls.length === 0)) {
        return render(<HomePage error="No bookmark folders containing website URLs were found." />, { status: 400 })
      }

      let jobId = createBookmarkSelectionJob(folders)
      return render(<BookmarkSelectionPage jobId={jobId} folders={folders} />)
    },

    confirmBookmarks({ get, render }) {
      let formData = get(FormData)
      let jobId = readText(formData, 'job_id')
      let folderPath = readText(formData, 'folder_path')
      let job = getBookmarkSelectionJob(jobId)
      if (!job) return new Response('Bookmark import not found.', { status: 404 })

      let folder = job.folders.find((candidate) => candidate.path === folderPath)
      if (!folder || folder.urls.length === 0) {
        return render(
          <BookmarkSelectionPage jobId={job.id} folders={job.folders} error="Choose a folder that contains at least one website." />,
          { status: 400 },
        )
      }

      let name = readText(formData, 'name') || folder.name
      let importedUrls = extractUrls(folder.urls.join('\n'))
      let { collectionId } = createCollectionWithImport(name.slice(0, 80), 'bookmarks', importedUrls, { jobId })
      return redirect(routes.collections.prepare.href({ collectionId }), 303)
    },

    show({ params, render }) {
      let collection = getCollectionSummary(params.collectionId)
      if (!collection) return new Response('Collection not found.', { status: 404 })
      return render(<CollectionPage collection={collection} />)
    },

    addSites({ get, params, render }) {
      let collection = getCollectionSummary(params.collectionId)
      if (!collection) return new Response('Collection not found.', { status: 404 })
      let importedUrls = extractUrls(readText(get(FormData), 'urls'))
      if (importedUrls.length === 0) {
        return render(<CollectionPage collection={collection} error="No valid website URLs were found." />, { status: 400 })
      }

      let result = addWebsites(collection.id, importedUrls)
      if (result.added === 0) {
        return render(<CollectionPage collection={collection} notice="Those websites are already in this collection." />)
      }
      return redirect(routes.collections.prepare.href({ collectionId: collection.id }), 303)
    },

    prepare({ params, render }) {
      let collection = getCollectionSummary(params.collectionId)
      if (!collection) return new Response('Collection not found.', { status: 404 })
      let progress = syncImportProgress(collection.id) ?? getLatestImportProgress(collection.id)
      if (!progress) return new Response('Import not found.', { status: 404 })
      return render(<PreparationPage collection={collection} progress={progress} />)
    },

    async progress({ params }) {
      let collection = getCollectionSummary(params.collectionId)
      if (!collection) return json({ error: 'Collection not found.' }, 404)
      let progress = await processPendingChecks(collection.id)
      if (!progress) return json({ error: 'Import not found.' }, 404)
      if (progress.ready >= 2) fillBacklog(collection.id)
      return json(progress)
    },

    compare({ params, render }) {
      let collection = getCollectionSummary(params.collectionId)
      if (!collection) return new Response('Collection not found.', { status: 404 })
      fillBacklog(collection.id)
      let pair = getOrActivateCurrentPair(collection.id)
      let preloads = getPreparedPairPreviews(collection.id)
      return render(<ComparisonPage collection={collection} pair={pair} preloads={preloads} />)
    },

    vote({ get, params }) {
      let formData = get(FormData)
      let pairId = readText(formData, 'pair_id')
      let choice = readText(formData, 'choice') as VoteChoice
      if (!pairId || !['left', 'right', 'skip'].includes(choice)) {
        return json({ error: 'Invalid vote.' }, 400)
      }

      try {
        let pair = recordVote(params.collectionId, pairId, choice)
        return pairPayload(params.collectionId, pair)
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Vote failed.' }, 409)
      }
    },

    runtimeFailed({ get, params }) {
      let formData = get(FormData)
      let pairId = readText(formData, 'pair_id')
      let websiteId = readText(formData, 'website_id')
      if (!pairId || !websiteId) return json({ error: 'Invalid runtime failure.' }, 400)
      let pair = markRuntimeFailed(params.collectionId, pairId, websiteId)
      return pairPayload(params.collectionId, pair)
    },

    ranking({ params, render }) {
      let collection = getCollectionSummary(params.collectionId)
      if (!collection) return new Response('Collection not found.', { status: 404 })
      return render(<RankingPage collection={collection} websites={getRankedWebsites(collection.id)} />)
    },
  },
})

function readText(formData: FormData, name: string): string {
  let value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function pairPayload(collectionId: string, pair: ComparisonPair | null) {
  return json({ pair, preloads: getPreparedPairPreviews(collectionId) })
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
