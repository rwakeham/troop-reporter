/* =========================================================================
   render.js — Pure rendering functions returning HTML strings.
   Exposes: window.TR.render
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
  // Utilities
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

  function eaglePill() {
    return '<span class="pill pill-eagle">Eagle</span>';
  }

  // ---------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------

  function renderBreadcrumb(view, state) {
    if (view.level === "troop") {
      return '<span class="crumb crumb-current">Troop</span>';
    }
    const parts = ['<a href="#" class="crumb" data-nav="troop">Troop</a>'];
    if (view.level === "patrol") {
      parts.push('<span class="crumb-sep">›</span>');
      parts.push('<span class="crumb crumb-current">' + esc(view.patrol) + " Patrol</span>");
    } else if (view.level === "scout") {
      const s = state.scouts[view.scout];
      if (s && s.patrol) {
        parts.push('<span class="crumb-sep">›</span>');
        parts.push(
          '<a href="#" class="crumb" data-nav="patrol" data-patrol="' +
          esc(s.patrol) + '">' + esc(s.patrol) + "</a>"
        );
      }
      parts.push('<span class="crumb-sep">›</span>');
      parts.push('<span class="crumb crumb-current">' +
        esc(s ? s.displayName : view.scout) + "</span>");
    }
    return parts.join("");
  }

  // ---------------------------------------------------------------------
  // Roster view (Troop or Patrol)
  // ---------------------------------------------------------------------

  function renderTroopView(state) {
    const all = Object.values(state.scouts);
    return renderRosterView({
      title: "Troop Advancement Dashboard",
      scouts: all,
      showPatrolColumn: true,
      showPatrolPills: true,
      state
    });
  }

  function renderPatrolView(state, patrol) {
    const names = state.patrols[patrol] || [];
    const scouts = names.map((n) => state.scouts[n]).filter(Boolean);
    return renderRosterView({
      title: patrol + " Patrol",
      scouts,
      showPatrolColumn: false,
      showPatrolPills: false,
      state
    });
  }

  function renderRosterView(opts) {
    const { title, scouts, showPatrolColumn, showPatrolPills, state } = opts;
    const total = scouts.length;
    const workingOnEagle = scouts.filter((s) => s.currentRank === "Life").length;
    const mbInProgress = scouts.reduce((sum, s) => sum + (s.totalInProgressBadges || 0), 0);
    const nearNextRank = scouts.filter(
      (s) => s.totalIncompleteRankReqs > 0 && s.totalIncompleteRankReqs <= 5
    ).length;
    const eagleMbInProgress = scouts.reduce(
      (sum, s) => sum + (s.eagleInProgressCount || 0), 0
    );

    const rankCounts = {};
    RANKS_ADVANCEMENT.forEach((r) => (rankCounts[r] = 0));
    scouts.forEach((s) => {
      if (s.currentRank && rankCounts[s.currentRank] != null) rankCounts[s.currentRank]++;
    });

    const metricsHtml = [
      metricCard("Total Scouts", total),
      state.rankAvailable ? metricCard("Working on Eagle", workingOnEagle) : "",
      state.badgesAvailable ? metricCard("MBs In Progress", mbInProgress) : "",
      state.rankAvailable ? metricCard("Near Next Rank (≤5)", nearNextRank) : "",
      state.badgesAvailable ? metricCard("Eagle MBs In Progress", eagleMbInProgress) : ""
    ].filter(Boolean).join("");

    const distHtml = state.rankAvailable
      ? renderRankDistribution(rankCounts)
      : '<div class="empty">Rank data not available.</div>';

    let patrolPillsHtml = "";
    if (showPatrolPills) {
      const patrols = Object.keys(state.patrols).sort();
      if (patrols.length > 1) {
        patrolPillsHtml =
          '<div class="section">' +
          '<h3 class="section-title">Patrols</h3>' +
          '<div class="patrol-pills">' +
          patrols.map((p) =>
            '<a href="#" class="patrol-pill" data-nav="patrol" data-patrol="' + esc(p) +
            '">' + esc(p) +
            ' <span class="patrol-pill-count">' + state.patrols[p].length + "</span></a>"
          ).join("") +
          "</div></div>";
      }
    }

    const rosterHtml = scouts.length
      ? renderRosterTable(scouts, showPatrolColumn, state)
      : '<div class="roster-empty">No scouts found.</div>';

    return '' +
      '<section class="dashboard">' +
        '<header class="dashboard-header">' +
          "<h2>" + esc(title) + "</h2>" +
          '<div class="dashboard-controls">' +
            '<input type="text" id="search-input" class="search-input" placeholder="Search by name…" autocomplete="off">' +
            (showPatrolColumn ? renderPatrolFilter(state) : "") +
          "</div>" +
        "</header>" +

        '<div class="metrics-row">' + metricsHtml + "</div>" +

        '<div class="section">' +
          '<h3 class="section-title">Rank Distribution</h3>' +
          distHtml +
        "</div>" +

        patrolPillsHtml +

        '<div class="section">' +
          '<h3 class="section-title">Roster</h3>' +
          rosterHtml +
        "</div>" +
      "</section>";
  }

  function renderRankDistribution(rankCounts) {
    const items = RANKS_ADVANCEMENT.map((rank) => {
      const count = rankCounts[rank] || 0;
      if (!count) return "";
      return '<div class="rank-dist-item ' + RANK_PILL_CLASS[rank] + '">' +
        '<span class="rank-dist-name">' + esc(rank) + "</span>" +
        '<span class="rank-dist-count">' + count + "</span>" +
        "</div>";
    }).filter(Boolean).join("");
    return '<div class="rank-distribution">' + (items || '<span class="muted">No rank data.</span>') + "</div>";
  }

  function renderPatrolFilter(state) {
    const patrols = Object.keys(state.patrols).sort();
    if (patrols.length <= 1) return "";
    return '<select id="patrol-filter" class="select"><option value="">All Patrols</option>' +
      patrols.map((p) => '<option value="' + esc(p) + '">' + esc(p) + "</option>").join("") +
      "</select>";
  }

  function metricCard(label, value) {
    return '<div class="metric-card">' +
      '<div class="metric-value">' + esc(value) + "</div>" +
      '<div class="metric-label">' + esc(label) + "</div>" +
      "</div>";
  }

  // Roster table -------------------------------------------------------

  function renderRosterTable(scouts, showPatrolColumn, state) {
    const sortKey = state.sort.key;
    const sortDir = state.sort.dir;
    const headers = [
      { key: "displayName", label: "Name" }
    ];
    if (showPatrolColumn) headers.push({ key: "patrol", label: "Patrol" });
    if (state.rankAvailable) headers.push({ key: "currentRankIdx", label: "Rank" });
    if (state.rankAvailable) headers.push({ key: "nextRank", label: "Next", sortable: false });
    if (state.rankAvailable) headers.push({ key: "totalIncompleteRankReqs", label: "Reqs", num: true });
    if (state.badgesAvailable) headers.push({ key: "totalInProgressBadges", label: "MBs", num: true });
    if (state.badgesAvailable) headers.push({ key: "eagleInProgressCount", label: "Eagle MBs", num: true });
    if (state.rankAvailable) headers.push({ key: "age", label: "Age", num: true });

    const headerHtml = headers.map((h) => {
      const sortable = h.sortable !== false;
      const cls = [
        sortable ? "sortable" : "",
        h.num ? "num" : "",
        sortable && sortKey === h.key ? "sort-" + sortDir : ""
      ].filter(Boolean).join(" ");
      const attrs = sortable ? ' data-sort="' + h.key + '"' : "";
      return "<th" + (cls ? ' class="' + cls + '"' : "") + attrs + ">" + esc(h.label) + "</th>";
    }).join("");

    const sorted = sortScouts(scouts, sortKey, sortDir);
    const bodyHtml = sorted.map((s) => rosterRowHtml(s, showPatrolColumn, state)).join("");

    return '<div class="table-wrap"><table class="roster-table" id="roster-table">' +
      "<thead><tr>" + headerHtml + "</tr></thead>" +
      "<tbody>" + bodyHtml + "</tbody>" +
      "</table></div>";
  }

  function rosterRowHtml(s, showPatrolColumn, state) {
    const cells = [
      '<td><a href="#" class="link" data-nav="scout" data-scout="' + esc(s.name) + '">' +
        esc(s.displayName) + "</a></td>"
    ];
    if (showPatrolColumn) {
      cells.push('<td><a href="#" class="link link-muted" data-nav="patrol" data-patrol="' +
        esc(s.patrol || "") + '">' + esc(s.patrol || "—") + "</a></td>");
    }
    if (state.rankAvailable) cells.push("<td>" + rankPill(s.currentRank) + "</td>");
    if (state.rankAvailable) cells.push("<td>" + esc(s.nextRank || "—") + "</td>");
    if (state.rankAvailable) cells.push('<td class="num">' + (s.totalIncompleteRankReqs || 0) + "</td>");
    if (state.badgesAvailable) cells.push('<td class="num">' + (s.totalInProgressBadges || 0) + "</td>");
    if (state.badgesAvailable) cells.push('<td class="num">' + (s.eagleInProgressCount || 0) + "</td>");
    if (state.rankAvailable) cells.push('<td class="num">' + (s.age != null ? s.age : "—") + "</td>");

    return '<tr data-search="' + esc(s.displayName.toLowerCase()) + '">' + cells.join("") + "</tr>";
  }

  function sortScouts(scouts, key, dir) {
    const mult = dir === "desc" ? -1 : 1;
    const getter = sortGetters[key] || ((s) => s[key]);
    return [...scouts].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
      return String(av).localeCompare(String(bv)) * mult;
    });
  }

  const sortGetters = {
    currentRankIdx: (s) => {
      const idx = RANKS_ADVANCEMENT.indexOf(s.currentRank);
      return idx === -1 ? null : idx;
    }
  };

  // ---------------------------------------------------------------------
  // Scout detail view
  // ---------------------------------------------------------------------

  function renderScoutView(state, scoutName, activeTab) {
    activeTab = activeTab || "overview";
    const s = state.scouts[scoutName];
    if (!s) return '<div class="empty">Scout not found: ' + esc(scoutName) + "</div>";

    const earnedCount = (s.meritBadges && s.meritBadges.earned.length) || 0;

    const metricCards = [
      metricCard("Current Rank", s.currentRank || "—"),
      state.rankAvailable
        ? metricCard("Next: " + (s.nextRank || "—"), s.totalIncompleteRankReqs + " reqs left")
        : "",
      state.badgesAvailable
        ? metricCard("MBs Earned", earnedCount + " (" + (s.eagleEarnedCount || 0) + " Eagle)")
        : "",
      state.badgesAvailable
        ? metricCard("MBs In Progress",
            (s.totalInProgressBadges || 0) + " (" + (s.eagleInProgressCount || 0) + " Eagle)")
        : ""
    ].filter(Boolean).join("");

    const tabs = [
      { id: "overview", label: "Overview" },
      { id: "ranks", label: "Rank Requirements" },
      { id: "badges", label: "Merit Badges" },
      { id: "actions", label: "Priority Actions" }
    ];

    return '' +
      '<section class="scout-detail">' +
        '<header class="scout-header">' +
          '<div class="scout-header-main">' +
            '<h2 class="scout-name">' + esc(s.displayName) + "</h2>" +
            '<div class="scout-meta">' +
              rankPill(s.currentRank) +
              (s.age != null ? '<span class="meta-item">Age ' + s.age + "</span>" : "") +
              (s.patrol ? '<span class="meta-item">Patrol ' + esc(s.patrol) + "</span>" : "") +
              (s.nextRank && s.nextRank !== s.currentRank
                ? '<span class="meta-item">Working toward ' + rankPill(s.nextRank) + "</span>"
                : "") +
            "</div>" +
          "</div>" +
          '<div class="scout-header-actions">' +
            '<button class="btn-secondary" disabled title="PDF export coming in Phase 2">Generate PDF</button>' +
          "</div>" +
        "</header>" +

        '<div class="scout-metrics">' + metricCards + "</div>" +

        '<div class="tabs">' +
          tabs.map((t) =>
            '<button class="tab' + (activeTab === t.id ? " tab-active" : "") +
            '" data-tab="' + t.id + '">' + esc(t.label) + "</button>"
          ).join("") +
        "</div>" +

        '<div class="tab-content">' + renderTab(s, activeTab, state) + "</div>" +
      "</section>";
  }

  function renderTab(s, tab, state) {
    if (tab === "overview") return renderOverviewTab(s, state);
    if (tab === "ranks") return renderRanksTab(s, state);
    if (tab === "badges") return renderBadgesTab(s, state);
    if (tab === "actions") return renderActionsTab(s);
    return "";
  }

  function renderOverviewTab(s, state) {
    if (!state.rankAvailable && !state.badgesAvailable) {
      return '<div class="empty">No data available.</div>';
    }
    return [
      state.rankAvailable
        ? renderRankProgression(s)
        : '<div class="empty">Rank data not available.</div>',
      state.badgesAvailable
        ? renderEagleRoadmap(s)
        : '<div class="empty">Merit badge data not available.</div>',
      renderTopActions(s)
    ].join("");
  }

  function renderRankProgression(s) {
    const completed = new Set(s.completedRanks || []);
    const incompleteRanks = s.incompleteRanks || {};

    const stepsHtml = RANKS_ADVANCEMENT.map((rank, i) => {
      const isCompleted = completed.has(rank);
      const isCurrent = rank === s.currentRank;
      const isNext = rank === s.nextRank && !isCurrent;
      const incomplete = incompleteRanks[rank];
      let cls = "step-future";
      if (isCompleted) cls = "step-done";
      else if (isCurrent) cls = "step-current";
      else if (isNext) cls = "step-next";

      return '<div class="rank-step ' + cls + '">' +
        '<div class="step-marker">' + (isCompleted ? "✓" : i + 1) + "</div>" +
        '<div class="step-label">' + esc(rank) + "</div>" +
        (incomplete && !isCompleted
          ? '<div class="step-sub">' + incomplete.count + " left</div>"
          : "") +
        "</div>";
    }).join('<div class="step-connector"></div>');

    return '<div class="card">' +
      '<h3 class="card-title">Rank Progression</h3>' +
      '<div class="rank-stepper">' + stepsHtml + "</div>" +
      "</div>";
  }

  function renderEagleRoadmap(s) {
    const r = s.eagleRoadmap || {};
    const stats = [
      ["Eagle Earned", r.eagleBadgesEarned],
      ["Eagle In Progress", r.eagleBadgesInProgress],
      ["Eagle Not Started", r.eagleBadgesNotStarted],
      ["Non-Eagle Earned", r.nonEagleBadgesEarned],
      ["Total Earned", r.totalBadgesEarned],
      ["Still Needed for Eagle", r.badgesNeededForEagle]
    ].map(([label, val]) =>
      '<div class="roadmap-stat">' +
        '<div class="roadmap-stat-value">' + (val != null ? val : 0) + "</div>" +
        '<div class="roadmap-stat-label">' + esc(label) + "</div>" +
      "</div>"
    ).join("");

    const unstarted = r.unstartedEagleBadges || [];
    const unstartedHtml = unstarted.length
      ? '<div class="roadmap-unstarted">' +
        "<strong>Unstarted Eagle-required badges:</strong>" +
        '<div class="badge-tag-list">' +
        unstarted.map((n) => '<span class="badge-tag">' + esc(n) + "</span>").join("") +
        "</div></div>"
      : "";

    return '<div class="card">' +
      '<h3 class="card-title">Eagle Roadmap</h3>' +
      '<div class="roadmap-grid">' + stats + "</div>" +
      unstartedHtml +
      "</div>";
  }

  function renderTopActions(s) {
    const top = (s.priorityActions || []).slice(0, 3);
    if (!top.length) return "";
    return '<div class="card">' +
      '<h3 class="card-title">Top Priorities</h3>' +
      '<ul class="action-list">' +
      top.map((a) =>
        '<li class="action-item action-tier-' + a.tier + '">' +
          '<div class="action-marker">T' + a.tier + "</div>" +
          '<div class="action-body">' +
            '<div class="action-title">' + esc(a.title) + "</div>" +
            '<div class="action-explanation">' + esc(a.explanation) + "</div>" +
          "</div>" +
        "</li>"
      ).join("") +
      "</ul></div>";
  }

  function renderRanksTab(s, state) {
    if (!state.rankAvailable) {
      return '<div class="empty">Rank data not available — upload the Rank Requirements Status export.</div>';
    }
    const entries = Object.entries(s.incompleteRanks || {});
    if (!entries.length) {
      const completedCount = (s.completedRanks || []).length;
      return '<div class="empty">No incomplete rank requirements' +
        (completedCount ? " — " + completedCount + " ranks completed." : ".") + "</div>";
    }
    entries.sort((a, b) => RANKS_ADVANCEMENT.indexOf(a[0]) - RANKS_ADVANCEMENT.indexOf(b[0]));
    return entries.map(([rank, info]) =>
      '<details class="card collapsible"' + (rank === s.nextRank ? " open" : "") + ">" +
        "<summary>" +
          '<span class="collapsible-title">' +
            rankPill(rank) +
            '<span class="collapsible-counts">' +
              info.count + " incomplete · " + info.completedCount + " completed" +
            "</span>" +
          "</span>" +
        "</summary>" +
        '<ul class="req-list">' +
          info.reqs.map((r) =>
            '<li class="req-item">' +
              '<span class="req-code">' + esc(r.code) + "</span>" +
              '<span class="req-text">' + esc(r.text) + "</span>" +
            "</li>"
          ).join("") +
        "</ul>" +
      "</details>"
    ).join("");
  }

  function renderBadgesTab(s, state) {
    if (!state.badgesAvailable) {
      return '<div class="empty">Merit badge data not available — upload the Merit Badges export.</div>';
    }
    const inProgress = (s.meritBadges && s.meritBadges.inProgress) || [];
    const earned = (s.meritBadges && s.meritBadges.earned) || [];

    const eagleIp = inProgress.filter((b) => b.isEagle).sort((a, b) => b.pctComplete - a.pctComplete);
    const nonEagleIp = inProgress.filter((b) => !b.isEagle).sort((a, b) => b.pctComplete - a.pctComplete);
    const earnedSorted = [...earned].sort((a, b) => {
      if (a.isEagle !== b.isEagle) return a.isEagle ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const sections = [];
    if (eagleIp.length) {
      sections.push(
        '<div class="card">' +
        '<h3 class="card-title">Eagle-Required In Progress</h3>' +
        eagleIp.map(badgeCard).join("") +
        "</div>"
      );
    }
    if (nonEagleIp.length) {
      sections.push(
        '<div class="card">' +
        '<h3 class="card-title">In Progress</h3>' +
        nonEagleIp.map(badgeCard).join("") +
        "</div>"
      );
    }
    if (earnedSorted.length) {
      sections.push(
        '<div class="card">' +
        '<h3 class="card-title">Earned (' + earnedSorted.length + ")</h3>" +
        '<ul class="earned-list">' +
        earnedSorted.map((b) =>
          '<li class="earned-item">' +
            (b.isEagle
              ? '<span class="earned-eagle" title="Eagle-required">★</span>'
              : '<span class="earned-eagle-spacer"></span>') +
            '<span class="earned-name">' + esc(b.name) + "</span>" +
            '<span class="earned-date">' + esc(formatDate(b.awardedDate)) + "</span>" +
          "</li>"
        ).join("") +
        "</ul></div>"
      );
    }
    if (!sections.length) {
      return '<div class="empty">No merit badge activity recorded.</div>';
    }
    return sections.join("");
  }

  function badgeCard(b) {
    const total = b.completedCount + b.uncompletedCount;
    return '<div class="badge-card">' +
      '<div class="badge-card-header">' +
        '<span class="badge-name">' + esc(b.name) + "</span>" +
        (b.isEagle ? eaglePill() : "") +
      "</div>" +
      '<div class="badge-progress">' +
        '<div class="progress-bar"><div class="progress-fill" style="width: ' + b.pctComplete + '%"></div></div>' +
        '<span class="badge-progress-text">' +
          b.completedCount + " of " + total + " reqs (" + Math.round(b.pctComplete) + "%)" +
        "</span>" +
      "</div>" +
      (b.counselor ? '<div class="badge-meta">Counselor: ' + esc(b.counselor) + "</div>" : "") +
      (b.comment ? '<div class="badge-comment">' + esc(b.comment) + "</div>" : "") +
      '<div class="badge-note">Individual requirement detail isn\'t available from this export — contact the merit badge counselor for remaining requirements.</div>' +
      "</div>";
  }

  function renderActionsTab(s) {
    const actions = s.priorityActions || [];
    if (!actions.length) {
      return '<div class="empty">No specific actions identified.</div>';
    }
    return '<ol class="action-list-numbered">' +
      actions.map((a, i) =>
        '<li class="action-item-numbered action-tier-' + a.tier + '">' +
          '<div class="action-num">' + (i + 1) + "</div>" +
          '<div class="action-body">' +
            '<div class="action-title">' + esc(a.title) + "</div>" +
            '<div class="action-explanation">' + esc(a.explanation) + "</div>" +
            (a.counselor
              ? '<div class="action-meta">Counselor: ' + esc(a.counselor) + "</div>"
              : "") +
            (a.effort
              ? '<div class="action-meta">' + esc(a.effort) + "</div>"
              : "") +
          "</div>" +
        "</li>"
      ).join("") +
      "</ol>";
  }

  // ---------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------

  TR.render = {
    renderBreadcrumb,
    renderTroopView,
    renderPatrolView,
    renderScoutView,
    rankPill,
    rosterRowHtml,
    sortScouts,
    esc
  };
})();
