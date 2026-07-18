# Site by Site

Site by Site is a local-first web app for ranking website inspiration through one-versus-one comparisons. Start with the bundled 34-site demo, drop a browser bookmarks export, or paste a mixed list of URLs. Then choose between two full-viewport websites until the collection settles into an order.

## Run locally

Site by Site requires Node.js 24.3 or newer and uses the same pnpm line as `books.christianrotzoll.com`.

```sh
corepack enable
pnpm install
pnpm dev
```

Open [http://localhost:44200](http://localhost:44200).

Useful checks:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm build` creates the production Worker and browser bundle in `dist`. `pnpm start` remains available for the Node runtime, while Cloudflare production and preview builds use the same application router through `workers/app.ts`.

## Deployment

The production Worker is configured for `site-by-site.christianrotzoll.com`. Build and deploy it with:

```sh
pnpm run deploy
```

Cloudflare serves the static assets directly and sends application routes to the Worker. The custom-domain route creates the DNS record and certificate through the `christianrotzoll.com` Cloudflare zone.

The `preview` Wrangler environment publishes a separate `workers.dev` Worker without the production custom domain:

```sh
pnpm run deploy:preview
```

## Privacy and persistence

Collections, URLs, votes, Elo ratings, and unavailable-site choices live in IndexedDB under the app’s origin. The implementation uses the small `idb` wrapper and asks the browser for persistent storage after a successful import.

The server:

- renders the application shell
- serves authored styles and the browser bundle
- receives only local collection IDs in page paths
- has no POST route for imports, votes, or URL checks
- never receives bookmark files or website URLs

Loading a comparison naturally makes the browser contact each third-party website. Comparison iframes use `referrerPolicy="no-referrer"`, so those websites do not receive the Site by Site page URL.

Browser storage remains scoped to one origin and browser profile. Clearing site data removes the library. The home and collection pages therefore offer a JSON backup download.

## Product flow

1. Start the bundled demo, paste URLs, or drop a standard browser-exported bookmarks HTML file.
2. The demo copies 34 known-working personal sites into one local collection and reuses it on later visits.
3. Bookmark folders are parsed and selected inline on the landing page.
4. A collection is created immediately. Pasted collections receive `Untitled collection`, with a number added when necessary; bookmark imports use the folder name.
5. The browser stores normalized, deduplicated websites locally and opens the first comparison.
6. Votes update Elo and comparison statistics atomically in IndexedDB.
7. Rankings and collection summaries are read from the same local library on later visits.
8. If a site does not render, mark the left or right site unavailable. It is stored locally and excluded from future pairs.

## Comparison controls

- `←` chooses the left website
- `→` chooses the right website
- `↓` skips the pair
- `s` swaps the visible sides without reloading either website
- `z` marks the visible left website unavailable
- `x` marks the visible right website unavailable
- Hold `1` to reveal the left website
- Hold `2` to reveal the right website
- Double-click the divider to reset it

Cross-origin iframes take keyboard focus when a user interacts with them, so the parent page cannot continue receiving arrow keys. A compact bottom dock keeps the controls visible, shows how to resume keyboard input when necessary, and provides left, swap, skip, and right buttons as a reliable fallback. Clicking or dragging the divider returns focus to the parent page. Swapping is visual only: choices are translated back to the underlying pair before they are stored, so rankings and history remain correct.

## Architecture

```text
server.ts                         Optional local Node Fetch server
workers/app.ts                    Cloudflare Worker entry
wrangler.jsonc                    Worker, assets, and custom-domain config
vite.config.ts                    Production browser bundle
app/routes.ts                     Read-only typed page routes
app/actions/                      Application shell controllers
app/data/demo-websites.ts         Bundled ready-site URLs for the opt-in demo
app/data/local-library.ts         Typed IndexedDB LocalLibrary module
app/services/                     Pure pairing and Elo decisions
app/utils/                        Bookmark and URL parsing
app/assets/site-by-site.tsx       Browser-owned application and UI state
app/assets/entry.ts               Explicit Remix 3 client entry
public/styles.css                 Shared authored CSS
```

`LocalLibrary` is the persistence seam. Callers work with collection imports, next-pair selection, votes, unavailable sites, rankings, and exports rather than IndexedDB object stores or transactions. Its implementation owns the schema and keeps multi-store comparison updates atomic.

The IndexedDB schema has three object stores:

- `collections` stores names, source types, timestamps, and the refresh-safe current pair
- `websites` stores normalized URLs, local availability, Elo ratings, and aggregate statistics
- `comparisons` stores completed choices and recent pair keys

Pair selection prioritizes under-exposed websites, avoids recent pairs when alternatives exist, favors similar ratings, occasionally crosses score ranges, and randomizes left/right placement.

## Embedding limitations

Browsers intentionally do not provide reliable failure events for cross-origin iframes: an iframe `load` event may fire even when a page was blocked, and an `error` event is generally withheld. Site by Site therefore does not guess based on a timeout. Each bottom domain capsule always includes its own “Didn’t load?” action; choosing it replaces that site and remembers the choice locally.

Some websites prevent framing with CSP or `X-Frame-Options`; others may be slow, geographically variable, or require interaction. Snapshot support remains a possible future fallback.
