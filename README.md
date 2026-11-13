# Site by Site

[Site by Site](https://site-by-site.christianrotzoll.com) turns side-by-side website choices into a personal ranking.

Import a browser bookmarks file, paste a list of URLs, or start with the bundled 34-site demo. Collections, choices, and rankings stay in IndexedDB in your browser.

## Development

Requires Node.js 24.3 or newer.

```sh
corepack enable
pnpm install
pnpm run dev
```

Open [http://localhost:44200](http://localhost:44200).

Run the complete verification suite with:

```sh
pnpm run check
```

This runs the TypeScript check, production build, and tests against both the built assets and the development asset server.

## Comparison controls

| Action                                  | Control                          |
| --------------------------------------- | -------------------------------- |
| Choose the left or right site           | `←` / `→`                        |
| Skip the pair                           | `↓`                              |
| Swap sides                              | `S`                              |
| Mark the left or right site unavailable | `Z` / `X`                        |
| Undo the last action                    | `U`                              |
| Reveal one site                         | Hold `1` / `2`                   |
| Inspect or reset the split              | Drag or double-click the divider |

If an embedded website takes keyboard focus, click the divider to resume using shortcuts. Comparisons require a window at least 640 pixels wide.

## Data and limitations

The Worker serves the application but does not receive imported URLs, choices, or ranking data. Clearing browser site data removes the local library, so the home page supports exporting and restoring a JSON backup.

Websites are loaded directly in no-referrer iframes. Some sites block embedding with CSP or `X-Frame-Options`; use **Didn’t load?** to exclude one from future pairs.

## Deployment

For a manual production deployment:

```sh
pnpm run deploy
```

Cloudflare GitHub integration settings:

| Setting                       | Value                                |
| ----------------------------- | ------------------------------------ |
| Production branch             | `main`                               |
| Build command                 | `pnpm run build`                     |
| Deploy command                | `pnpm exec wrangler deploy`          |
| Non-production deploy command | `pnpm exec wrangler versions upload` |
| Root directory                | `.`                                  |

The Cloudflare Worker name must match `site-by-site-christianrotzoll-com` in `wrangler.jsonc`.
