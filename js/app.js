/* =========================================================================
   app.js — Application state, navigation, file ingestion, event wiring.
   ========================================================================= */

(function () {
  "use strict";

  const state = {
    scouts: {},
    patrols: {},
    rankAvailable: false,
    badgesAvailable: false,
    rankFileName: null,
    badgesFileName: null,
    view: { level: "troop", tab: "overview" },
    sort: { key: "displayName", dir: "asc" },
    pendingRankRows: null,
    pendingMbRows: null
  };

  function $(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------

  function init() {
    setupUpload();
    $("dashboard-view").addEventListener("click", handleDashboardClick);
    $("breadcrumb").addEventListener("click", handleBreadcrumbClick);
    $("dashboard-view").addEventListener("input", handleDashboardInput);
    $("dashboard-view").addEventListener("change", handleDashboardChange);
    $("reset-btn").addEventListener("click", resetApp);
  }

  // ---------------------------------------------------------------------
  // Upload handling
  // ---------------------------------------------------------------------

  function setupUpload() {
    const dropzone = $("dropzone");
    const input = $("file-input");

    input.addEventListener("change", (e) => {
      handleFiles(Array.from(e.target.files || []));
      input.value = "";
    });

    dropzone.addEventListener("click", (e) => {
      // Don't double-trigger when the label inside the dropzone is clicked
      if (e.target.tagName === "LABEL" || e.target.closest("label")) return;
      input.click();
    });

    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });

    ["dragenter", "dragover"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.add("dropzone-hover");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dropzone-hover");
      });
    });
    dropzone.addEventListener("drop", (e) => {
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      handleFiles(files);
    });
  }

  async function handleFiles(files) {
    if (!files.length) return;
    setUploadError("");

    for (const file of files) {
      try {
        const { rows, name } = await TR.parse.readFile(file);
        const kind = TR.parse.identifyFile(rows);
        addFileStatus(name, kind);
        if (kind === "rank_requirements") {
          state.pendingRankRows = rows;
          state.rankFileName = name;
        } else if (kind === "merit_badges") {
          state.pendingMbRows = rows;
          state.badgesFileName = name;
        } else {
          setUploadError("Could not identify columns in " + name +
            ". Expected a Rank Requirements Status or Merit Badges export.");
        }
      } catch (err) {
        setUploadError("Failed to read " + file.name + ": " + (err.message || err));
      }
    }

    if (state.pendingRankRows || state.pendingMbRows) {
      buildAndShow();
    }
  }

  function addFileStatus(name, kind) {
    const status = $("file-status");
    const labelMap = {
      rank_requirements: "Rank Requirements Status",
      merit_badges: "Merit Badges",
      unknown: "Unrecognized"
    };
    const cls = kind === "unknown" ? "file-bad" : "file-ok";
    const row = document.createElement("div");
    row.className = "file-row " + cls;
    row.innerHTML =
      '<span class="file-name"></span>' +
      '<span class="file-kind"></span>';
    row.querySelector(".file-name").textContent = name;
    row.querySelector(".file-kind").textContent = labelMap[kind] || kind;
    // Replace any existing entry for the same file name
    const existing = Array.from(status.children).find(
      (el) => el.querySelector(".file-name").textContent === name
    );
    if (existing) status.replaceChild(row, existing);
    else status.appendChild(row);
  }

  function setUploadError(msg) {
    $("upload-error").textContent = msg || "";
  }

  function buildAndShow() {
    const dataset = TR.parse.buildScoutRecords(
      state.pendingRankRows || [],
      state.pendingMbRows || []
    );
    state.scouts = dataset.scouts;
    state.patrols = dataset.patrols;
    state.rankAvailable = !!state.pendingRankRows;
    state.badgesAvailable = !!state.pendingMbRows;
    state.view = { level: "troop", tab: "overview" };

    // Choose a sensible default sort when rank data is missing
    if (!state.rankAvailable) state.sort = { key: "displayName", dir: "asc" };

    $("upload-view").classList.add("hidden");
    $("dashboard-view").classList.remove("hidden");
    $("app-actions").classList.remove("hidden");

    updateMeta();
    renderAll();
  }

  function resetApp() {
    state.scouts = {};
    state.patrols = {};
    state.rankAvailable = false;
    state.badgesAvailable = false;
    state.rankFileName = null;
    state.badgesFileName = null;
    state.pendingRankRows = null;
    state.pendingMbRows = null;
    state.view = { level: "troop", tab: "overview" };

    $("file-status").innerHTML = "";
    setUploadError("");
    $("dashboard-view").classList.add("hidden");
    $("dashboard-view").innerHTML = "";
    $("breadcrumb").classList.add("hidden");
    $("breadcrumb").innerHTML = "";
    $("app-actions").classList.add("hidden");
    $("upload-view").classList.remove("hidden");
    $("data-meta").textContent = "";
  }

  function updateMeta() {
    const scoutCount = Object.keys(state.scouts).length;
    const patrolCount = Object.keys(state.patrols).filter((p) => p !== "Unassigned").length;
    const sources = [];
    if (state.rankFileName) sources.push("Ranks: " + state.rankFileName);
    if (state.badgesFileName) sources.push("Badges: " + state.badgesFileName);
    $("data-meta").textContent =
      scoutCount + " scouts · " + patrolCount + " patrols · " + sources.join(" · ");
  }

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------

  function setView(viewState) {
    state.view = Object.assign({ tab: "overview" }, viewState);
    state.sort = { key: "displayName", dir: "asc" };
    renderAll();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function renderAll() {
    const breadcrumb = $("breadcrumb");
    breadcrumb.classList.remove("hidden");
    breadcrumb.innerHTML = TR.render.renderBreadcrumb(state.view, state);

    const dash = $("dashboard-view");
    if (state.view.level === "troop") {
      dash.innerHTML = TR.render.renderTroopView(state);
    } else if (state.view.level === "patrol") {
      dash.innerHTML = TR.render.renderPatrolView(state, state.view.patrol);
    } else if (state.view.level === "scout") {
      dash.innerHTML = TR.render.renderScoutView(state, state.view.scout, state.view.tab);
    }
  }

  // ---------------------------------------------------------------------
  // Event handlers (delegated)
  // ---------------------------------------------------------------------

  function handleBreadcrumbClick(e) {
    const navEl = e.target.closest("[data-nav]");
    if (!navEl) return;
    e.preventDefault();
    handleNavTarget(navEl);
  }

  function handleDashboardClick(e) {
    // Tab clicks
    const tabEl = e.target.closest("[data-tab]");
    if (tabEl) {
      state.view = Object.assign({}, state.view, { tab: tabEl.dataset.tab });
      renderAll();
      return;
    }

    // Sortable column header
    const sortEl = e.target.closest("th.sortable");
    if (sortEl) {
      const key = sortEl.dataset.sort;
      if (state.sort.key === key) {
        state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
      } else {
        state.sort = { key, dir: "asc" };
      }
      // Re-render only the table — preserves the search input value & focus
      rebuildRosterTable();
      return;
    }

    // Navigation links / pills
    const navEl = e.target.closest("[data-nav]");
    if (navEl) {
      e.preventDefault();
      handleNavTarget(navEl);
    }
  }

  function handleNavTarget(el) {
    const target = el.dataset.nav;
    if (target === "troop") {
      setView({ level: "troop" });
    } else if (target === "patrol") {
      const patrol = el.dataset.patrol;
      if (patrol) setView({ level: "patrol", patrol });
      else setView({ level: "troop" });
    } else if (target === "scout") {
      const scout = el.dataset.scout;
      if (scout) setView({ level: "scout", scout });
    }
  }

  function handleDashboardInput(e) {
    if (e.target.id === "search-input") {
      applyTableSearch(e.target.value);
    }
  }

  function handleDashboardChange(e) {
    if (e.target.id === "patrol-filter") {
      const patrol = e.target.value;
      if (patrol) setView({ level: "patrol", patrol });
    }
  }

  // ---------------------------------------------------------------------
  // Roster table updates without full re-render
  // ---------------------------------------------------------------------

  function currentRosterScouts() {
    if (state.view.level === "patrol") {
      const names = state.patrols[state.view.patrol] || [];
      return names.map((n) => state.scouts[n]).filter(Boolean);
    }
    return Object.values(state.scouts);
  }

  function rebuildRosterTable() {
    const table = document.getElementById("roster-table");
    if (!table) return;
    const showPatrolColumn = state.view.level === "troop";
    const scouts = currentRosterScouts();
    const sorted = TR.render.sortScouts(scouts, state.sort.key, state.sort.dir);
    table.querySelector("tbody").innerHTML =
      sorted.map((s) => TR.render.rosterRowHtml(s, showPatrolColumn, state)).join("");
    // Update header sort indicators
    table.querySelectorAll("th.sortable").forEach((th) => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.sort === state.sort.key) {
        th.classList.add("sort-" + state.sort.dir);
      }
    });
    // Re-apply current search filter
    const searchInput = $("search-input");
    if (searchInput && searchInput.value) applyTableSearch(searchInput.value);
  }

  function applyTableSearch(query) {
    const q = (query || "").trim().toLowerCase();
    const tbody = document.querySelector("#roster-table tbody");
    if (!tbody) return;
    Array.from(tbody.children).forEach((tr) => {
      const hay = tr.dataset.search || "";
      tr.style.display = !q || hay.includes(q) ? "" : "none";
    });
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
