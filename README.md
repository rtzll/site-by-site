# Site by Site

Site by Site is a local-first MVP for ranking website inspiration through one-versus-one comparisons. Import a browser bookmarks folder or paste a mixed list of URLs, let the app check which sites are likely embeddable, then choose between two full-viewport websites until the collection settles into an order.

## Run locally

Site by Site requires Node.js 24.3 or newer.

```sh
npm install
npm run dev
```

Open [http://localhost:44200](http://localhost:44200). The SQLite database is created and migrated automatically at `db/site-by-site.sqlite`.

Useful checks:

```sh
npm run typecheck
npm test
npm run check
```

## Product flow

1. Paste URLs or upload a standard browser-exported bookmarks HTML file.
2. For bookmarks, choose a discovered folder. Nested folder links count toward their parents.
3. The preparation screen polls a persisted database queue. Each URL is fetched with `GET`, redirects are followed, and framing headers are classified.
4. Likely embeddable sites enter a persisted backlog of up to ten unique pairs.
5. The comparison view preflights the current pair in hidden iframes, displays both sites at full viewport size, and clips their wrapper layers around a draggable divider.
6. Arrow-key votes update Elo and aggregate statistics transactionally. Skips increment exposure and skip counts without changing ratings.
7. The ranking page shows available sites first, ordered by rating, followed by unavailable sites retained for future snapshot support.

## Controls

- `←` chooses the left website
- `→` chooses the right website
- `↓` skips the pair
- Hold `1` to reveal the left website
- Hold `2` to reveal the right website
- Double-click the divider to reset it
- `Enter` opens the focused website in a new tab

Dragging only changes the clipping boundary. It never records a vote, and iframe interaction is not treated as a choice.

## Architecture

The app follows the same Remix 3 application model as `books.christianrotzoll.com`—typed routes, controllers, middleware, Remix UI, and explicit browser entrypoints—while intentionally using a different local runtime:

```text
server.ts                         Node Fetch server
app/routes.ts                     Typed URL contract
app/actions/                      Controllers and route-owned pages
app/middleware/                   Rendering and database context
app/data/                         Schema, SQLite setup, and persistence
app/services/                     Embed checks, jobs, backlog, pairing, Elo
app/utils/                        Bookmark and URL parsing
app/assets/entry.ts               Browser-only progressive enhancement
db/migrations/                    Immutable SQL migrations
public/styles.css                 Shared authored CSS
```

The production books app uses Vite, Cloudflare Workers, D1, and pnpm. Site by Site keeps this MVP deliberately local: one pinned `remix` package, Node's built-in server, SQLite and Fetch implementations, plain CSS, and no client state library or external queue. Its domain services and SQL-backed job model are isolated so a later Workers/D1 deployment remains a contained migration rather than a product rewrite.

### Database model

- `collections` owns imported website libraries.
- `websites` stores input, normalized, and final URLs; embed classification; Elo and aggregate statistics; and nullable snapshot fields.
- `import_jobs` stores paste imports and temporary parsed bookmark-folder payloads.
- `url_check_jobs` is the durable embeddability-check queue.
- `prepared_pairs` is the refresh-safe comparison backlog and current session state.
- `comparisons` records completed or skipped matchups.
- `votes` is the immutable choice audit trail.

Complex multi-row updates use explicit SQLite transactions. Pure decisions—normalization, header classification, Elo, and pair selection—stay independent from Remix and persistence.

## Pair selection

New and under-exposed websites are prioritized for their first several appearances. After that, the selector favors similar ratings, avoids recent pairs, occasionally crosses score ranges, and randomizes left/right placement. Active backlog pairs are unique; small collections can therefore have fewer than ten prepared pairs.

The Elo K-factor decreases as sites gain comparisons so early votes move the order without permanently locking it:

- fewer than 5 comparisons: `K = 40`
- fewer than 15 comparisons: `K = 24`
- 15 or more comparisons: `K = 16`

## Embedding limitations

The server checks `Content-Security-Policy` `frame-ancestors`, `X-Frame-Options`, redirects, response status, content type, reachability, and timeouts. A browser preflight is also attempted before a pair becomes visible, and later pairs are loaded invisibly in the background.

Cross-origin browser security makes perfect iframe failure detection impossible. Some blocked frames still fire `load`, some sites change headers by geography or user agent, and a site may become unavailable after preparation. Runtime failures are recorded and removed from future pairs when detectable, but the MVP cannot guarantee that every third-party frame will always render.

Other intentional MVP limits:

- no authentication or multi-user ownership
- no external worker; preparation advances through bounded polling requests
- no snapshot capture yet
- no SSRF hardening for public deployment; the app is intended for trusted local input
- single-process SQLite deployment

For a hosted version, move URL checks to an isolated worker, reject private-network targets, add authentication and resource ownership, and use snapshot rendering as the reliable fallback for non-embeddable sites.
