import type { Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { AppHeader } from '../ui/app-header.tsx'
import { Document } from '../ui/document.tsx'

export function HomePage(handle: Handle<{ error?: string }>) {
  return () => (
    <Document title="Site by Site · Rank website inspiration">
      <div class="app-shell">
        <AppHeader />
        <main class="import-main isolate">
          <section class="intro">
            <p class="eyebrow">A quieter way to decide</p>
            <h1>Rank the websites that stay with you.</h1>
            <p class="intro-copy">
              Bring a collection of references. Site by Site turns them into simple, side-by-side choices.
            </p>
          </section>

          {handle.props.error ? <p class="form-error" role="alert">{handle.props.error}</p> : null}

          <div class="import-grid">
            <form
              class="import-panel bookmark-form"
              method="post"
              action={routes.collections.inspectBookmarks.href()}
              encType="multipart/form-data"
            >
              <div>
                <p class="panel-number">01</p>
                <h2>Drop bookmarks</h2>
                <p>Use the HTML file exported by your browser, then choose one folder.</p>
              </div>
              <label class="drop-zone" data-drop-zone>
                <input
                  class="drop-input"
                  type="file"
                  name="bookmarks"
                  accept=".html,text/html"
                  required
                  data-bookmark-input
                />
                <span class="drop-title">Choose or drop an HTML file</span>
                <span class="drop-note">Up to 2 MB</span>
              </label>
            </form>

            <form class="import-panel paste-form" method="post" action={routes.collections.create.href()}>
              <div>
                <p class="panel-number">02</p>
                <h2>Paste URLs</h2>
                <p>Lines, prose, Markdown, and copied lists all work.</p>
              </div>
              <div class="field-stack">
                <label for="collection-name">Collection name</label>
                <input
                  id="collection-name"
                  name="name"
                  type="text"
                  placeholder="Website inspiration"
                  maxLength={80}
                  required
                />
              </div>
              <div class="field-stack field-grow">
                <label for="urls">Websites</label>
                <textarea
                  id="urls"
                  name="urls"
                  placeholder={'https://example.com\nhttps://another.example'}
                  required
                ></textarea>
              </div>
              <button class="button button-primary" type="submit">Prepare collection</button>
            </form>
          </div>
        </main>
      </div>
    </Document>
  )
}
