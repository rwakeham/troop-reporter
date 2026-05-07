# troop-reporter

A static, browser-based dashboard for BSA troop advancement data exported from
TroopWebHost. Drop in the rank-requirements and merit-badges exports and
navigate from the troop down to a single scout — no install, no server, no data
upload.

## For end users — single-file distribution

The simplest way to use this tool is the bundled build at
[`dist/troop-reporter.html`](dist/troop-reporter.html). It's a single
self-contained HTML file (~950 KB) with all CSS, JS, PapaParse, and SheetJS
inlined.

Download it, double-click to open in any modern browser, drag your two
TroopWebHost exports onto the drop zone, and you're done. The file works
offline; nothing is uploaded.

## For developers — running from source

The repo also serves the modular source directly. Three options:

**1. Local — `file://`**
Open `index.html` in a browser and drag the two CSV (or XLSX) files onto the
drop zone.

**2. Local HTTP server**
```bash
python3 -m http.server 8000
```
Then open <http://localhost:8000>.

**3. Hosted (e.g., GitHub Pages)**
Serve the repo root as a static site. No build step required for the source
form; it loads PapaParse and SheetJS from jsDelivr.

## Inputs

Two TroopWebHost exports, both troop-wide:

- **Rank Requirements Status** — *Menu → Advancement → Maintain Advancement →
  Export Rank Requirements to Excel*
- **Merit Badges** — *Menu → Advancement → Maintain Advancement → Merit Badges*
  (export all results)

CSV (UTF-8 with or without BOM) and XLSX are both supported. The app
identifies each file by its column headers, not by filename, and tolerates
either or both files.

## Architecture

Vanilla JS + CSS, no runtime build step. Three layers:

- `js/parse.js` — file ingestion and scout-record construction (PapaParse for
  CSV, SheetJS for XLSX).
- `js/render.js` — pure rendering functions (state in, HTML string out).
- `js/app.js` — state, navigation, drag-and-drop, sort/search wiring.

All troop data is parsed once on upload and held in memory; navigation between
troop, patrol, and scout views is client-side only.

## Building the single-file bundle

```bash
npm install
npm run build
```

This produces `dist/troop-reporter.html`. The build script (`build.js`) is
plain Node, no bundler. It inlines `styles.css`, the three `js/*.js`
modules, and the vendored copies of PapaParse and SheetJS into a single
self-contained HTML file.

The bundled file is committed to the repo so end users can grab it from the
GitHub raw URL without having to clone or build.

## Phase 2 (planned)

- PDF advancement summary per scout (action plan + roadmap).
- CSV / printable export of priority-action lists.
- Optional roster export.

## Repo layout

```
index.html              entry point (CDN-linked source form)
styles.css              design system + components
js/parse.js             CSV/XLSX → scout records
js/render.js            views (troop / patrol / scout detail)
js/app.js               state, navigation, file upload
build.js                bundles source into dist/troop-reporter.html
dist/troop-reporter.html  bundled distribution (committed)
package.json            pins PapaParse and SheetJS for the build
```
