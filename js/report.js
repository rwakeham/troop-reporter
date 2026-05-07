/* =========================================================================
   report.js — Builds a self-contained styled HTML report for one scout
   and delivers it as a downloadable .html file. The report renders the
   same in any browser; the user can save as PDF via File > Print if they
   want a PDF.
   Exposes: window.TR.report
   No external dependencies.
   ========================================================================= */

window.TR = window.TR || {};

(function () {
  "use strict";

  const TR = window.TR;
  const RANKS_ADVANCEMENT = TR.parse.RANKS_ADVANCEMENT;

  const RANK_PILL_CLASS = {
    "Scout": "rank-scout",
    "Tenderfoot": "rank-tenderfoot",
    "Second Class": "rank-second-class",
    "First Class": "rank-first-class",
    "Star": "rank-star",
    "Life": "rank-life",
    "Eagle": "rank-eagle"
  };

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(d) {
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date)) return "";
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function rankPill(rank) {
    if (!rank) return '<span class="pill pill-muted">—</span>';
    const cls = RANK_PILL_CLASS[rank] || "rank-unknown";
    return '<span class="pill ' + cls + '">' + esc(rank) + "</span>";
  }

  // ---------------------------------------------------------------------
  // Section builders
  // ---------------------------------------------------------------------

  function buildHeader(scout) {
    const meta = [];
    if (scout.age != null) meta.push("Age " + scout.age);
    if (scout.patrol) meta.push("Patrol: " + esc(scout.patrol));
    if (scout.currentRank) meta.push("Current rank: " + esc(scout.currentRank));
    if (scout.nextRank && scout.nextRank !== scout.currentRank) {
      meta.push("Working toward: " + esc(scout.nextRank));
    }
    return (
      '<header class="report-header">' +
        '<div class="report-titles">' +
          '<h1>' + esc(scout.displayName || scout.name || "Scout") + '</h1>' +
          '<div class="report-subtitle">BSA Advancement Report</div>' +
        '</div>' +
        '<div class="report-meta">' + esc(formatDate(new Date())) + '</div>' +
      '</header>' +
      (meta.length ? '<div class="meta-line">' + meta.join(" &middot; ") + "</div>" : "")
    );
  }

  function buildMetricsGrid(scout, state) {
    const cards = [];
    if (state.rankAvailable) {
      cards.push(metricCard("Current Rank", scout.currentRank || "—"));
      cards.push(metricCard(
        "Next Rank",
        (scout.nextRank || "—") + " — " + (scout.totalIncompleteRankReqs || 0) + " reqs"
      ));
    }
    if (state.badgesAvailable) {
      const earnedCount = (scout.meritBadges && scout.meritBadges.earned.length) || 0;
      cards.push(metricCard(
        "Merit Badges Earned",
        earnedCount + " (" + (scout.eagleEarnedCount || 0) + " Eagle)"
      ));
      cards.push(metricCard(
        "Merit Badges In Progress",
        (scout.totalInProgressBadges || 0) + " (" + (scout.eagleInProgressCount || 0) + " Eagle)"
      ));
    }
    if (!cards.length) return "";
    return '<div class="metrics-grid">' + cards.join("") + "</div>";
  }

  function metricCard(label, value) {
    return (
      '<div class="metric-card">' +
        '<div class="metric-value">' + esc(value) + '</div>' +
        '<div class="metric-label">' + esc(label) + '</div>' +
      '</div>'
    );
  }

  function buildEagleRoadmap(scout, state) {
    if (!state.badgesAvailable || !scout.eagleRoadmap) return "";
    const r = scout.eagleRoadmap;
    const stats = [
      ["Eagle Earned", r.eagleBadgesEarned || 0],
      ["Eagle In Progress", r.eagleBadgesInProgress || 0],
      ["Eagle Not Started", r.eagleBadgesNotStarted || 0],
      ["Non-Eagle Earned", r.nonEagleBadgesEarned || 0],
      ["Total Earned", r.totalBadgesEarned || 0],
      ["Still Needed", r.badgesNeededForEagle || 0]
    ].map(([label, val]) =>
      '<div class="eagle-stat">' +
        '<div class="eagle-stat-value">' + esc(val) + '</div>' +
        '<div class="eagle-stat-label">' + esc(label) + '</div>' +
      '</div>'
    ).join("");

    const unstarted = r.unstartedEagleBadges || [];
    const unstartedHtml = unstarted.length
      ? '<div class="eagle-unstarted"><strong>Unstarted Eagle-required:</strong> ' +
        unstarted.map(esc).join(" &middot; ") + "</div>"
      : "";

    return (
      '<section class="report-section">' +
        '<h2 class="section-heading">Eagle Scout Roadmap</h2>' +
        '<div class="eagle-roadmap">' + stats + '</div>' +
        unstartedHtml +
      "</section>"
    );
  }

  function buildRankRequirements(scout, state) {
    if (!state.rankAvailable) return "";
    const rankReqs = scout.rankRequirements || {};
    const ranks = RANKS_ADVANCEMENT.filter((r) => rankReqs[r]);
    if (!ranks.length) {
      return (
        '<section class="report-section">' +
          '<h2 class="section-heading">Rank Requirements</h2>' +
          '<p class="empty-section">No rank requirement data available.</p>' +
        "</section>"
      );
    }
    return (
      '<section class="report-section">' +
        '<div class="section-heading-row">' +
          '<h2 class="section-heading">Rank Requirements</h2>' +
          '<div class="section-toolbar" role="toolbar" aria-label="Rank requirements controls">' +
            '<label class="toolbar-toggle">' +
              '<input type="checkbox" data-toggle="hide-completed">' +
              ' Hide completed' +
            '</label>' +
            '<button type="button" class="toolbar-btn" data-action="collapse-all">Collapse all</button>' +
            '<button type="button" class="toolbar-btn" data-action="expand-all">Expand all</button>' +
          '</div>' +
        '</div>' +
        ranks.map((rank) => buildRankBlock(rank, rankReqs[rank])).join("") +
      "</section>"
    );
  }

  function buildRankBlock(rank, info) {
    const rows = info.reqs.map((r) =>
      '<tr class="' + (r.completed ? "req-completed" : "req-incomplete") + '">' +
        '<td class="req-status">' + (r.completed ? "&#10003;" : "&#9675;") + '</td>' +
        '<td class="req-code">' + esc(r.code) + '</td>' +
        '<td class="req-text">' + esc(r.text) + '</td>' +
        '<td class="req-date">' +
          (r.completed && r.dateEarned ? esc(formatDate(r.dateEarned)) : "") +
        '</td>' +
      "</tr>"
    ).join("");

    const fullyComplete = info.incompleteCount === 0;
    return (
      '<details class="rank-block" open>' +
        '<summary class="rank-block-header">' +
          rankPill(rank) +
          '<span class="rank-block-counts">' +
            info.completedCount + " of " + info.totalCount + " complete" +
            (fullyComplete ? " &#10003;" : "") +
          '</span>' +
        '</summary>' +
        '<table class="report-table">' +
          '<thead><tr>' +
            '<th class="col-status"></th>' +
            '<th class="col-code">Code</th>' +
            '<th class="col-text">Requirement</th>' +
            '<th class="col-date">Date</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      "</details>"
    );
  }

  function buildMeritBadges(scout, state) {
    if (!state.badgesAvailable) return "";
    const mb = scout.meritBadges || { inProgress: [], earned: [] };
    const eagleIp = (mb.inProgress || []).filter((b) => b.isEagle).sort((a, b) => b.pctComplete - a.pctComplete);
    const nonEagleIp = (mb.inProgress || []).filter((b) => !b.isEagle).sort((a, b) => b.pctComplete - a.pctComplete);
    const earned = [...(mb.earned || [])].sort((a, b) => {
      if (a.isEagle !== b.isEagle) return a.isEagle ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    if (!eagleIp.length && !nonEagleIp.length && !earned.length) {
      return (
        '<section class="report-section">' +
          '<h2 class="section-heading">Merit Badges</h2>' +
          '<p class="empty-section">No merit badge activity recorded.</p>' +
        "</section>"
      );
    }

    let html = '<section class="report-section"><h2 class="section-heading">Merit Badges</h2>';
    if (eagleIp.length) {
      html += '<h3 class="subsection-heading">Eagle-Required In Progress</h3>';
      html += eagleIp.map(badgeBlock).join("");
    }
    if (nonEagleIp.length) {
      html += '<h3 class="subsection-heading">In Progress</h3>';
      html += nonEagleIp.map(badgeBlock).join("");
    }
    if (earned.length) {
      html += '<h3 class="subsection-heading">Earned (' + earned.length + ')</h3>';
      html += '<ul class="earned-list">' + earned.map(earnedRow).join("") + '</ul>';
    }
    html += "</section>";
    return html;
  }

  function badgeBlock(b) {
    const total = b.completedCount + b.uncompletedCount;
    const pct = Math.round(b.pctComplete);
    return (
      '<div class="badge-block">' +
        '<div class="badge-block-header">' +
          '<span class="badge-name">' + esc(b.name) +
            (b.isEagle ? ' <span class="pill pill-eagle">Eagle</span>' : "") +
          '</span>' +
          '<span class="badge-progress-text">' +
            b.completedCount + " of " + total + " (" + pct + "%)" +
          '</span>' +
        '</div>' +
        '<div class="progress-bar">' +
          '<div class="progress-fill" style="width:' + pct + '%"></div>' +
        '</div>' +
        (b.counselor ? '<div class="badge-meta">Counselor: ' + esc(b.counselor) + '</div>' : "") +
        (b.comment ? '<div class="badge-comment">' + esc(b.comment) + '</div>' : "") +
      "</div>"
    );
  }

  function earnedRow(b) {
    return (
      '<li class="earned-item">' +
        '<span class="earned-mark">' + (b.isEagle ? "&#9733;" : "") + '</span>' +
        '<span class="earned-name">' + esc(b.name) + '</span>' +
        '<span class="earned-date">' + (b.awardedDate ? esc(formatDate(b.awardedDate)) : "") + '</span>' +
      "</li>"
    );
  }

  function buildPriorityActions(scout) {
    const actions = scout.priorityActions || [];
    if (!actions.length) return "";
    return (
      '<section class="report-section">' +
        '<h2 class="section-heading">Prioritized Action Plan</h2>' +
        '<ol class="priority-list">' +
          actions.map((a, i) =>
            '<li class="priority-item priority-tier-' + (a.tier || 1) + '">' +
              '<span class="priority-num">' + (i + 1) + '</span>' +
              '<div class="priority-body">' +
                '<div class="priority-title">' + esc(a.title) + '</div>' +
                '<div class="priority-explanation">' + esc(a.explanation) + '</div>' +
                (a.counselor ? '<div class="priority-meta">Counselor: ' + esc(a.counselor) + '</div>' : "") +
                (a.effort ? '<div class="priority-meta">' + esc(a.effort) + '</div>' : "") +
              '</div>' +
            '</li>'
          ).join("") +
        '</ol>' +
      "</section>"
    );
  }

  function buildScoutReport(scout, state) {
    return (
      '<article class="scout-report">' +
        buildHeader(scout) +
        buildMetricsGrid(scout, state) +
        buildEagleRoadmap(scout, state) +
        buildRankRequirements(scout, state) +
        buildMeritBadges(scout, state) +
        buildPriorityActions(scout) +
      '</article>'
    );
  }

  // ---------------------------------------------------------------------
  // Print stylesheet
  // ---------------------------------------------------------------------

  const REPORT_STYLES = `
    @page { size: letter; margin: 0.6in; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: white;
      color: #1f1f1d;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 14pt 0; }
    h1, h2, h3 { margin: 0; font-weight: 700; }
    p { margin: 0; }
    ul, ol { margin: 0; padding: 0; list-style: none; }

    .scout-report { padding: 0 16pt; page-break-after: always; break-after: page; }
    .scout-report:last-child { page-break-after: auto; break-after: auto; }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2pt solid #185fa5;
      padding-bottom: 8pt;
      margin-bottom: 12pt;
    }
    .report-titles h1 { font-size: 24pt; line-height: 1.1; }
    .report-subtitle { color: #5f5e5a; font-size: 10pt; margin-top: 2pt; }
    .report-meta { color: #5f5e5a; font-size: 9pt; }

    .meta-line {
      font-size: 10pt;
      color: #1f1f1d;
      margin-bottom: 14pt;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8pt;
      margin-bottom: 14pt;
    }
    .metric-card {
      border: 0.75pt solid #d3d1c7;
      border-radius: 4pt;
      padding: 8pt 12pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .metric-value { font-size: 16pt; font-weight: 700; line-height: 1.2; }
    .metric-label {
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888780;
      margin-top: 2pt;
    }

    .report-section { margin-top: 14pt; }
    .section-heading {
      font-size: 12pt;
      border-bottom: 0.75pt solid #d3d1c7;
      padding-bottom: 3pt;
      margin-bottom: 8pt;
      page-break-after: avoid;
      break-after: avoid;
    }
    .subsection-heading {
      font-size: 10pt;
      color: #5f5e5a;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 10pt 0 4pt;
      page-break-after: avoid;
      break-after: avoid;
    }

    .eagle-roadmap {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 4pt;
      margin-bottom: 8pt;
    }
    .eagle-stat {
      background: #f1efe8;
      padding: 6pt 4pt;
      text-align: center;
      border-radius: 3pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .eagle-stat-value { font-size: 13pt; font-weight: 700; line-height: 1.1; }
    .eagle-stat-label {
      font-size: 6.5pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #888780;
      margin-top: 2pt;
    }
    .eagle-unstarted {
      background: #faeeda;
      color: #633806;
      padding: 6pt 8pt;
      border-radius: 3pt;
      font-size: 9pt;
      margin-top: 6pt;
    }

    details.rank-block {
      margin-bottom: 12pt;
      page-break-inside: avoid;
      break-inside: avoid-page;
    }
    details.rank-block > summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10pt;
      padding: 6pt 10pt;
      margin-bottom: 4pt;
      border-radius: 4pt;
      background: #f1efe8;
      user-select: none;
      transition: background-color 0.12s;
    }
    details.rank-block > summary:hover { background: #e6dec7; }
    details.rank-block[open] > summary { background: #e6f1fb; }
    details.rank-block[open] > summary:hover { background: #d3e6f7; }
    details.rank-block > summary::-webkit-details-marker { display: none; }
    details.rank-block > summary::marker { content: ""; }
    details.rank-block > summary::before {
      content: "\\25B8"; /* triangle right */
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14pt;
      height: 14pt;
      flex-shrink: 0;
      font-size: 12pt;
      line-height: 1;
      color: #185fa5;
      transition: transform 0.15s ease;
    }
    details.rank-block[open] > summary::before { transform: rotate(90deg); }
    .rank-block-header { /* legacy class, harmless */ }
    .rank-block-counts {
      margin-left: auto;
      font-size: 9pt;
      color: #5f5e5a;
    }

    /* Toolbar (screen only) */
    .section-heading-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12pt;
      flex-wrap: wrap;
      border-bottom: 0.75pt solid #d3d1c7;
      padding-bottom: 3pt;
      margin-bottom: 8pt;
    }
    .section-heading-row .section-heading {
      border-bottom: none;
      padding-bottom: 0;
      margin-bottom: 0;
    }
    .section-toolbar {
      display: flex;
      align-items: center;
      gap: 8pt;
      font-size: 9pt;
    }
    .toolbar-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4pt;
      cursor: pointer;
      user-select: none;
      color: #5f5e5a;
    }
    .toolbar-toggle input { cursor: pointer; }
    .toolbar-btn {
      font: inherit;
      font-size: 9pt;
      padding: 3pt 8pt;
      background: white;
      color: #1f1f1d;
      border: 0.75pt solid #d3d1c7;
      border-radius: 3pt;
      cursor: pointer;
    }
    .toolbar-btn:hover { background: #f7f5ee; }
    .toolbar-btn:focus-visible { outline: 2px solid #185fa5; outline-offset: 1px; }

    /* Hide-completed toggle: scope to rank-block details, not earned MBs etc. */
    body.hide-completed details.rank-block tr.req-completed { display: none; }

    @media print {
      .section-toolbar { display: none !important; }
      details.rank-block > summary {
        cursor: default;
        background: transparent !important;
        padding: 2pt 0;
      }
      details.rank-block > summary::before { display: none; }
    }

    table.report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
    }
    .report-table thead th {
      background: #185fa5;
      color: white;
      text-align: left;
      padding: 4pt 8pt;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .report-table tbody td {
      padding: 3.5pt 8pt;
      border-bottom: 0.4pt solid #d3d1c7;
      vertical-align: top;
    }
    .report-table tbody tr:nth-child(even) td { background: #f7f5ee; }

    .col-status, .req-status { width: 18pt; text-align: center; }
    .col-code, .req-code {
      width: 60pt;
      font-family: "SF Mono", Menlo, Consolas, monospace;
      font-size: 8.5pt;
      color: #5f5e5a;
    }
    .col-date, .req-date {
      width: 78pt;
      text-align: right;
      color: #888780;
      font-size: 8.5pt;
    }
    .req-completed .req-status { color: #1d9e75; font-weight: 700; }
    .req-incomplete .req-status { color: #888780; }
    .req-completed .req-text {
      color: #888780;
      text-decoration: line-through;
    }

    .badge-block {
      border: 0.75pt solid #d3d1c7;
      border-radius: 4pt;
      padding: 8pt 10pt;
      margin-bottom: 6pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .badge-block-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4pt;
      gap: 8pt;
    }
    .badge-name { font-weight: 700; font-size: 11pt; }
    .badge-progress-text { font-size: 9pt; color: #5f5e5a; white-space: nowrap; }
    .progress-bar {
      height: 5pt;
      background: #f1efe8;
      border-radius: 3pt;
      overflow: hidden;
      margin-bottom: 4pt;
    }
    .progress-fill { height: 100%; background: #185fa5; }
    .badge-meta { font-size: 9pt; color: #5f5e5a; }
    .badge-comment {
      font-size: 9pt;
      color: #5f5e5a;
      font-style: italic;
      border-left: 1.5pt solid #d3d1c7;
      padding-left: 6pt;
      margin-top: 4pt;
    }

    .earned-list {
      column-count: 2;
      column-gap: 16pt;
      font-size: 9.5pt;
    }
    .earned-item {
      break-inside: avoid;
      display: flex;
      gap: 4pt;
      padding: 2pt 0;
      border-bottom: 0.4pt dashed #e2dfd4;
    }
    .earned-mark { width: 10pt; color: #ba7517; font-size: 10pt; flex-shrink: 0; }
    .earned-name { flex: 1; }
    .earned-date { color: #888780; font-size: 8.5pt; }

    .priority-list { display: flex; flex-direction: column; gap: 6pt; }
    .priority-item {
      display: flex;
      gap: 8pt;
      padding: 8pt;
      background: #f7f5ee;
      border-left: 3pt solid #d3d1c7;
      border-radius: 3pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .priority-tier-1 { border-left-color: #a32d2d; }
    .priority-tier-2 { border-left-color: #ba7517; }
    .priority-tier-3 { border-left-color: #185fa5; }
    .priority-num {
      flex-shrink: 0;
      width: 22pt;
      height: 22pt;
      line-height: 22pt;
      text-align: center;
      border-radius: 11pt;
      color: white;
      font-weight: 700;
      font-size: 11pt;
    }
    .priority-tier-1 .priority-num { background: #a32d2d; }
    .priority-tier-2 .priority-num { background: #ba7517; }
    .priority-tier-3 .priority-num { background: #185fa5; }
    .priority-title { font-weight: 700; font-size: 11pt; margin-bottom: 1pt; }
    .priority-explanation { color: #5f5e5a; font-size: 9.5pt; }
    .priority-meta { color: #888780; font-size: 8.5pt; margin-top: 1pt; }

    .pill {
      display: inline-block;
      padding: 1.5pt 7pt;
      border-radius: 9pt;
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .pill-muted { background: #f1efe8; color: #888780; }
    .pill-eagle { background: #faeeda; color: #633806; }
    .rank-scout        { background: #e8d5b7; color: #5c4a2a; }
    .rank-tenderfoot   { background: #d4e8d0; color: #2d5a27; }
    .rank-second-class { background: #d0dde8; color: #2a4a6b; }
    .rank-first-class  { background: #e8d0d0; color: #6b2a2a; }
    .rank-star         { background: #e8e2d0; color: #6b5a2a; }
    .rank-life         { background: #d8d0e8; color: #4a2a6b; }
    .rank-eagle        { background: #f0e6c8; color: #6b4a00; }

    .empty-section { color: #888780; font-style: italic; }
  `;

  // Inline JS embedded in every report. Wires up the section toolbar
  // (hide-completed, expand all, collapse all) and forces all <details>
  // blocks open just before printing so collapsed sections don't get
  // omitted from a print-to-PDF.
  const REPORT_INLINE_JS = `
    (function () {
      "use strict";
      var body = document.body;
      // Each scout report has its own toolbar; scope queries to the toolbar's
      // closest ancestor section (the Rank Requirements <section>).
      function withinScope(toolbar, selector) {
        var section = toolbar.closest(".report-section");
        return section ? section.querySelectorAll(selector) : [];
      }
      document.querySelectorAll(".section-toolbar").forEach(function (tb) {
        tb.addEventListener("click", function (e) {
          var btn = e.target.closest("[data-action]");
          if (!btn) return;
          var act = btn.dataset.action;
          var details = withinScope(tb, "details.rank-block");
          if (act === "expand-all") {
            details.forEach(function (d) { d.open = true; });
          } else if (act === "collapse-all") {
            details.forEach(function (d) { d.open = false; });
          }
        });
        tb.addEventListener("change", function (e) {
          var t = e.target.closest("[data-toggle]");
          if (!t) return;
          if (t.dataset.toggle === "hide-completed") {
            body.classList.toggle("hide-completed", !!t.checked);
          }
        });
      });
      // Make sure all collapsed details are open when printing, then restore.
      var preOpenSet = null;
      window.addEventListener("beforeprint", function () {
        preOpenSet = new Set();
        document.querySelectorAll("details").forEach(function (d) {
          if (d.open) preOpenSet.add(d);
          else d.open = true;
        });
      });
      window.addEventListener("afterprint", function () {
        if (!preOpenSet) return;
        document.querySelectorAll("details").forEach(function (d) {
          if (!preOpenSet.has(d)) d.open = false;
        });
        preOpenSet = null;
      });
    })();
  `;

  function buildReportDocument(bodyHtml, title) {
    return (
      "<!DOCTYPE html>" +
      '<html lang="en">' +
      '<head>' +
        '<meta charset="UTF-8">' +
        '<title>' + esc(title) + '</title>' +
        '<style>' + REPORT_STYLES + '</style>' +
      '</head>' +
      '<body>' + bodyHtml + '<script>' + REPORT_INLINE_JS + '</script></body>' +
      '</html>'
    );
  }

  // ---------------------------------------------------------------------
  // File delivery
  // ---------------------------------------------------------------------

  function reportFilename(scout) {
    const safe = (scout.displayName || scout.name || "scout")
      .replace(/[^a-z0-9 ]/gi, "_")
      .replace(/\s+/g, "_");
    return safe + "_advancement.html";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadHtmlDocument(html, filename) {
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), filename);
  }

  function buildScoutReportHtml(scout, state) {
    return buildReportDocument(
      buildScoutReport(scout, state),
      "Advancement Report — " + (scout.displayName || scout.name || "Scout")
    );
  }

  function downloadScoutReport(scout, state) {
    downloadHtmlDocument(buildScoutReportHtml(scout, state), reportFilename(scout));
  }

  async function downloadScoutReportsZip(scouts, state, onProgress) {
    if (!scouts || !scouts.length) return;
    if (typeof window.JSZip === "undefined") {
      throw new Error("JSZip library not available");
    }
    const zip = new window.JSZip();
    for (let i = 0; i < scouts.length; i++) {
      const scout = scouts[i];
      if (onProgress) onProgress(i, scouts.length, scout.displayName);
      try {
        zip.file(reportFilename(scout), buildScoutReportHtml(scout, state));
      } catch (err) {
        console.error("Report build failed for", scout.displayName, err);
      }
      // Yield to keep the UI responsive on large rosters
      await new Promise((r) => setTimeout(r, 0));
    }
    if (onProgress) onProgress(scouts.length, scouts.length, null);
    // generateAsync('blob') has interop quirks in some environments;
    // produce a uint8array and wrap in a Blob ourselves.
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const zipBlob = new Blob([bytes], { type: "application/zip" });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(zipBlob, "advancement_reports_" + stamp + ".zip");
  }

  TR.report = {
    downloadScoutReport,
    downloadScoutReportsZip,
    buildScoutReport,
    buildScoutReportHtml,
    buildReportDocument,
    reportFilename
  };
})();
