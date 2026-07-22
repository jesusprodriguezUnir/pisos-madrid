# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Angular 22 (standalone, zoneless, signals) app that searches Madrid apartment listings scraped from idealista.com and fotocasa.es, normalizing €/m² and flagging listings priced below their (zone, operation) median. Static site deployed to GitHub Pages. Node scraper (`scripts/scrape/`) writes one JSON per district under `public/data/districts/`, which the app fetches as static assets — see "Data flow" below.

## Commands

- `npm start` — dev server (`ng serve`)
- `npm run build` — production build
- `npm run build:pages` — production build with `--base-href /pisos-madrid/` (used by deploy workflow; must match the repo name)
- `npm test` — run all tests once (`vitest run`)
- `npm run test:watch` — vitest watch mode
- `npx vitest run <path/to/file.spec.ts>` — run a single test file
- `npx vitest run -t "<test name>"` — run a single test by name (or add `.only` to a `describe`/`it`)
- `npm run lint` — eslint, `--max-warnings 0`
- `npm run format` / `npm run format:check` — prettier write/check
- `npm run scrape` — run the scraper (`tsx scripts/scrape/index.ts`), overwrites `public/data/districts/*.json`. First run needs `npx playwright install chromium` (fotocasa scraping uses a headless browser).

CI (`.github/workflows/ci.yml`) runs in this order on push/PR to `main`: `format:check` → `lint` → `test` → `build`. Match that order locally before pushing.

## Architecture

### Domain has zero Angular dependency
`src/app/core/models/listing.model.ts` and `src/app/core/utils/listing-stats.ts` are pure TypeScript with no `@angular/*` imports. They're imported identically by both the Angular app and the Node scraper (`scripts/scrape/config.ts` imports `Operation` from the model). This is why tests run under plain Vitest with `environment: 'node'` (see `vitest.config.ts`) instead of Angular's `@angular/build:unit-test`/TestBed — there's no component-level test coverage currently. If TestBed-based component tests are ever added, that builder and a `tsconfig.spec.json` need to be reinstated.

### Raw data is persisted; metrics are derived
Each `public/data/districts/{slug}.json` only stores what the portals publish (id, zone, operation, address, price, rooms, area, floor text, url, source). Derived fields — `pricePerM2`, `zoneMedian`, `deltaVsZone`, `hasLift`, `isExterior` — are computed client-side on load by `enrich()` in `src/app/core/utils/listing-stats.ts`, over the combined set of every district. Changing the "bargain" threshold (`BARGAIN_THRESHOLD = -10`) or the median formula never requires re-scraping.

### Medians are per (zone, operation) pair
`enrich()` buckets listings by `${zone} ${operation}` before computing medians — comparing sale vs. rental €/m², or across neighborhoods, is meaningless. `deltaVsZone` always answers "how expensive is this for its neighborhood and operation type."

### One dataset file per district, indexed
`ZONES` in `scripts/scrape/config.ts` now lists individual neighborhoods (not districts) — Chamberí was split into its constituent barrios (Gaztambide, Arapiles, Trafalgar, Almagro, Vallehermoso, Ríos Rosas) because comparing a zone-wide median across a whole district was too coarse. Each zone has three slugs: `slug` (stable, kebab-case — the output filename), `idealista` (URL path segment on idealista.com), `fotocasa` (URL path segment on fotocasa.es) — the two portals don't share neighborhood naming. `public/data/districts/index.json` lists `{name, slug}` for every configured zone; the app reads it first to know which per-district files to fetch, so it must be regenerated (which `index.ts` always does) even for zones that yielded 0 fresh listings on a given run.

### Two scraper sources, one shared filtering contract
- **idealista** (`scripts/scrape/parser.ts`): server-rendered HTML, parsed with `node-html-parser`. Selectors are the fragile contract — see below.
- **fotocasa** (`scripts/scrape/fotocasa.ts` + `fotocasa-parser.ts`): fotocasa renders listings client-side with JavaScript — a plain `fetch()` only returns ~1 of ~150 results per page. `fotocasa.ts` drives a headless Chromium via Playwright, waits for detail-page links (`a[href*="/vivienda/"]`), and extracts each card's ancestor container as plain text instead of relying on fotocasa's generated `re-*` CSS classes (deliberately more robust, but coarser). `fotocasa-parser.ts` is the pure function that regex-parses that text — kept separate from the Playwright driver specifically so it's unit-testable without a browser (see `fotocasa-parser.spec.ts`).

Both parsers apply the same `CRITERIA` (min rooms, min area, max price per operation) at parse time regardless of what the URL's own filters did — the URL is a coarse pre-filter, the parser is the source of truth for what enters the dataset.

### Data flow: scraper → static assets → app
1. `npm run scrape` (or the scheduled `scrape.yml` workflow, weekdays 06:15 UTC) iterates `ZONES × OPERATIONS × {idealista, fotocasa} × pages` (`scripts/scrape/config.ts`), parses each page, dedupes by listing id within a zone.
2. Per zone, if both sources combined yield zero listings, `index.ts` skips writing that zone's file — protects the committed per-zone dataset from being wiped by a bad/blocked run. If every zone comes back empty, the whole run throws.
3. Otherwise it writes a `ListingsDataset` (`{ source, scrapedAt, total, listings }`) to `public/data/districts/{slug}.json`, and always rewrites `public/data/districts/index.json` from `ZONES`. Angular's asset glob (`public/**/*` in `angular.json`) copies the whole `districts/` directory into the build output verbatim.
4. `ListingsService` (`src/app/core/services/listings.service.ts`) fetches `data/districts/index.json` via `HttpClient` + `toSignal` (chosen over `httpResource()`, which was still experimental at time of writing), then fetches every listed district file, merges their listings, applies `enrich()`, and exposes `listings`/`zones`/`scrapedAt`/`isLoading`/`error` as signals. A district file that 404s or fails to fetch is silently dropped rather than failing the whole load.
5. `ListingsPage` (`src/app/features/listings/listings-page.ts`) holds `filters`/`sort` as signals, computes `rows` via `sortListings(applyFilters(...))` and `summary` via `summarize()` — all pure functions from `listing-stats.ts`.
6. `scrape.yml` commits `public/data/districts/` directly to `main` only when it changed, which triggers `deploy.yml` (push-to-main) to rebuild and republish — no separate step is needed to pick up fresh data since it's baked into the static build.

### Scraper fragility (check here first when scraping breaks)
- **idealista selectors**: `parser.ts` depends on `article.item`, `.item-link`, `.item-price`, `.item-detail` — idealista markup changes will break this silently (0 listings, HTTP 200).
- **fotocasa selectors**: `fotocasa-parser.ts`'s regexes (price, rooms, m², floor) assume Spanish text like "3 hab." / "90 m²" inside a card's text blob — if fotocasa changes its copy or the detail-page URL stops matching `/vivienda/.../{id}/d`, `fotocasa.ts`'s card extraction returns nothing.
- **Blocking**: HTTP 403/429 on either portal usually means anti-bot protection (DataDome on idealista) blocking the request origin, including GitHub Actions runners and possibly headless Chromium fingerprints on fotocasa. Don't build proxy rotation — the pragmatic fix is running `npm run scrape` locally and committing the result.
- **Zone slugs**: neighborhood URL slugs don't match official Ayuntamiento naming, and idealista/fotocasa don't use the same slugs as each other (e.g. Embajadores is `lavapies-embajadores` on idealista, `embajadores-lavapies` on fotocasa; Casa de Campo hangs off Moncloa not Latina). A 404 — or a page that loads with 0 listings — in the scrape log is almost always this; check `ZONES` in `scripts/scrape/config.ts`.
- `CRITERIA.delayMs` (2500ms throttle) exists specifically to avoid bans — don't lower it. It's applied between pages on both sources.

### Search criteria
Defined in one place, `scripts/scrape/config.ts` (`ZONES`, `OPERATIONS`, `CRITERIA`): zones Argüelles, Ciudad Universitaria, Casa de Campo, Puerta del Ángel, Embajadores, Tetuán, Gaztambide, Arapiles, Trafalgar, Almagro, Vallehermoso, Ríos Rosas; venta ≤ €550,000, alquiler ≤ €1,800/mo; ≥2 rooms, ≥60 m²; up to 3 pages (~90 listings) per zone×operation×source combo.

### Config notes
- `.prettierignore` excludes `public/data/**/*.json` (machine-generated) — it is NOT gitignored; the dataset is intentionally version-controlled.
- ESLint disables the `no-console` restriction for `scripts/**/*.ts` only — the scraper is a CLI, console output is its UI.
- `tsconfig.app.json` excludes `*.spec.ts`; `tsconfig.node.json` is what actually covers `scripts/`, spec files, `vitest.config.ts`, and `eslint.config.js`.
- `playwright` is a devDependency used only by the scraper (`scripts/scrape/fotocasa.ts`), not the Angular app — it never ships in the production bundle.
