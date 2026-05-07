# troop-reporter

A static, browser-based dashboard for BSA troop advancement data exported from
TroopWebHost. Drop in the rank-requirements and merit-badges exports and
navigate from the troop down to a single scout — no install, no server, no data
upload.

## Running

The app is a static site. Three options:

**1. Local — `file://`**
Open `index.html` in a browser and drag the two CSV (or XLSX) files onto the
drop zone. The "Try with sample data" button only works over HTTP — see below.

**2. Local HTTP server** (enables the sample-data button)
From the repo root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

**3. Hosted (e.g., GitHub Pages)**
Serve the repo root as a static site. No build step.

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

Vanilla JS + CSS, no build step. Three layers:

- `js/parse.js` — file ingestion and scout-record construction (PapaParse for
  CSV, SheetJS for XLSX, both via CDN).
- `js/render.js` — pure rendering functions (state in, HTML string out).
- `js/app.js` — state, navigation, drag-and-drop, sort/search wiring.

All troop data is parsed once on upload and held in memory; navigation between
troop, patrol, and scout views is client-side only.

## Phase 2 (planned)

- PDF advancement summary per scout (action plan + roadmap).
- CSV / printable export of priority-action lists.
- Optional roster export.

## Repo layout

```
index.html            entry point + CDN script tags
styles.css            design system + components
js/parse.js           CSV/XLSX → scout records
js/render.js          views (troop / patrol / scout detail)
js/app.js             state, navigation, file upload
samples/              two TroopWebHost exports for testing
```
