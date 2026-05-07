/* =========================================================================
   pdf.js — Per-scout PDF report generation + ZIP bundling.
   Exposes: window.TR.pdf
   Depends on: window.jspdf (UMD), window.JSZip
   ========================================================================= */

window.TR = window.TR || {};

(function () {
  "use strict";

  const TR = window.TR;
  const RANKS_ADVANCEMENT = TR.parse.RANKS_ADVANCEMENT;

  // Page geometry (jsPDF default unit: pt @ 72dpi for 'letter')
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 54;
  const CONTENT_W = PAGE_W - 2 * MARGIN;
  const FOOTER_Y = PAGE_H - MARGIN + 18;
  const PAGE_BOTTOM = PAGE_H - MARGIN;

  // Color palette (matches the on-screen design tokens)
  const C = {
    text: "#1f1f1d",
    secondary: "#5f5e5a",
    muted: "#888780",
    border: "#d3d1c7",
    bgAlt: "#f1efe8",
    primary: "#185fa5",
    success: "#1d9e75",
    warning: "#ba7517",
    danger: "#a32d2d",
    eagleBg: "#faeeda",
    eagleText: "#633806",
    t1: "#a32d2d",
    t2: "#ba7517",
    t3: "#185fa5"
  };

  // Rank pill colors (background, text)
  const RANK_PILL = {
    "Scout":        ["#e8d5b7", "#5c4a2a"],
    "Tenderfoot":   ["#d4e8d0", "#2d5a27"],
    "Second Class": ["#d0dde8", "#2a4a6b"],
    "First Class":  ["#e8d0d0", "#6b2a2a"],
    "Star":         ["#e8e2d0", "#6b5a2a"],
    "Life":         ["#d8d0e8", "#4a2a6b"],
    "Eagle":        ["#f0e6c8", "#6b4a00"]
  };

  // ---------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------

  function getJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    throw new Error("jsPDF library not available");
  }

  function getJSZip() {
    if (!window.JSZip) throw new Error("JSZip library not available");
    return window.JSZip;
  }

  function setText(doc, font, size, color) {
    doc.setFont("helvetica", font || "normal");
    doc.setFontSize(size);
    doc.setTextColor(color || C.text);
  }

  function ensureSpace(doc, y, needed) {
    if (y + needed > PAGE_BOTTOM) {
      doc.addPage();
      return MARGIN;
    }
    return y;
  }

  function drawHRule(doc, y, color) {
    doc.setDrawColor(color || C.border);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  }

  function drawSectionHeader(doc, y, title, color) {
    y = ensureSpace(doc, y, 28);
    setText(doc, "bold", 13, C.text);
    doc.text(title, MARGIN, y);
    y += 4;
    doc.setDrawColor(color || C.primary);
    doc.setLineWidth(1);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    return y + 14;
  }

  function drawPill(doc, x, y, text, bg, fg) {
    setText(doc, "bold", 9, fg);
    const w = doc.getTextWidth(text) + 14;
    doc.setFillColor(bg);
    doc.roundedRect(x, y - 9, w, 14, 7, 7, "F");
    doc.text(text, x + 7, y + 1);
    return w;
  }

  function drawRankPill(doc, x, y, rank) {
    const [bg, fg] = RANK_PILL[rank] || [C.bgAlt, C.muted];
    return drawPill(doc, x, y, rank || "—", bg, fg);
  }

  function drawEaglePill(doc, x, y) {
    return drawPill(doc, x, y, "Eagle", C.eagleBg, C.eagleText);
  }

  // 2-col metric grid
  function drawMetricGrid(doc, y, items) {
    const cols = 2;
    const cellW = (CONTENT_W - 12) / cols;
    const cellH = 44;
    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (col === 0) y = ensureSpace(doc, y, cellH + 4);
      const x = MARGIN + col * (cellW + 12);
      const top = y + row * (cellH + 8);
      doc.setFillColor("#ffffff");
      doc.setDrawColor(C.border);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, top, cellW, cellH, 4, 4, "FD");
      setText(doc, "bold", 16, C.text);
      doc.text(String(item[1] != null ? item[1] : "—"), x + 12, top + 22);
      setText(doc, "normal", 9, C.muted);
      doc.text(String(item[0]).toUpperCase(), x + 12, top + 36);
    });
    const rows = Math.ceil(items.length / cols);
    return y + rows * (cellH + 8);
  }

  // Eagle roadmap mini-table
  function drawEagleRoadmap(doc, y, roadmap) {
    const stats = [
      ["Eagle Earned", roadmap.eagleBadgesEarned || 0],
      ["Eagle In Progress", roadmap.eagleBadgesInProgress || 0],
      ["Eagle Not Started", roadmap.eagleBadgesNotStarted || 0],
      ["Non-Eagle Earned", roadmap.nonEagleBadgesEarned || 0],
      ["Total Earned", roadmap.totalBadgesEarned || 0],
      ["Still Needed for Eagle", roadmap.badgesNeededForEagle || 0]
    ];
    const cellW = CONTENT_W / stats.length;
    const cellH = 36;
    y = ensureSpace(doc, y, cellH + 4);
    stats.forEach((s, i) => {
      const x = MARGIN + i * cellW;
      doc.setFillColor(C.bgAlt);
      doc.rect(x, y, cellW, cellH, "F");
      setText(doc, "bold", 14, C.text);
      doc.text(String(s[1]), x + cellW / 2, y + 16, { align: "center" });
      setText(doc, "normal", 7, C.muted);
      doc.text(String(s[0]).toUpperCase(), x + cellW / 2, y + 28, { align: "center" });
    });
    y += cellH + 4;

    const unstarted = roadmap.unstartedEagleBadges || [];
    if (unstarted.length) {
      y = ensureSpace(doc, y, 30);
      setText(doc, "bold", 9, C.text);
      doc.text("Unstarted Eagle-required badges:", MARGIN, y);
      y += 12;
      setText(doc, "normal", 9, C.eagleText);
      const lines = doc.splitTextToSize(unstarted.join(" · "), CONTENT_W);
      lines.forEach((line) => {
        y = ensureSpace(doc, y, 12);
        doc.text(line, MARGIN, y);
        y += 12;
      });
    }
    return y + 4;
  }

  // Rank requirements: per-rank table showing all reqs with completed flag
  function drawRankRequirements(doc, y, scout) {
    const rankReqs = scout.rankRequirements || {};
    const ranks = RANKS_ADVANCEMENT.filter((r) => rankReqs[r]);
    if (!ranks.length) {
      setText(doc, "italic", 10, C.muted);
      doc.text("No rank requirement data available.", MARGIN, y);
      return y + 14;
    }

    ranks.forEach((rank) => {
      const info = rankReqs[rank];
      // Section title for this rank
      y = ensureSpace(doc, y, 30);
      drawRankPill(doc, MARGIN, y + 4, rank);
      setText(doc, "normal", 9, C.muted);
      doc.text(
        info.completedCount + " of " + info.totalCount + " complete" +
          (info.incompleteCount === 0 ? "  ✓" : ""),
        PAGE_W - MARGIN, y + 4,
        { align: "right" }
      );
      y += 14;

      // Table header
      drawReqTableHeader(doc, y);
      y += 14;

      info.reqs.forEach((req, i) => {
        y = drawReqRow(doc, y, req, i);
      });
      y += 8;
    });
    return y;
  }

  function drawReqTableHeader(doc, y) {
    doc.setFillColor(C.primary);
    doc.rect(MARGIN, y - 10, CONTENT_W, 14, "F");
    setText(doc, "bold", 8, "#ffffff");
    doc.text("STATUS",  MARGIN + 6,   y);
    doc.text("CODE",    MARGIN + 50,  y);
    doc.text("REQUIREMENT", MARGIN + 110, y);
    doc.text("DATE",    PAGE_W - MARGIN - 6, y, { align: "right" });
  }

  function drawReqRow(doc, y, req, i) {
    // Predict row height by wrapping the requirement text
    const textW = CONTENT_W - 110 - 70;
    setText(doc, "normal", 9, C.text);
    const lines = doc.splitTextToSize(req.text || "", textW);
    const rowH = Math.max(14, lines.length * 11 + 4);

    // Page break check
    if (y + rowH > PAGE_BOTTOM) {
      doc.addPage();
      y = MARGIN;
      drawReqTableHeader(doc, y);
      y += 14;
    }

    // Zebra
    if (i % 2 === 1) {
      doc.setFillColor(C.bgAlt);
      doc.rect(MARGIN, y - 10, CONTENT_W, rowH, "F");
    }
    // Status circle/check
    if (req.completed) {
      setText(doc, "bold", 11, C.success);
      doc.text("✓", MARGIN + 14, y);
    } else {
      setText(doc, "normal", 11, C.muted);
      doc.text("○", MARGIN + 14, y);
    }
    // Code
    doc.setFont("courier", "normal").setFontSize(8).setTextColor(C.secondary);
    doc.text(req.code || "", MARGIN + 50, y);
    // Requirement text (wrapped); strikethrough if completed
    setText(doc, "normal", 9, req.completed ? C.muted : C.text);
    lines.forEach((line, j) => {
      const ly = y + j * 11;
      doc.text(line, MARGIN + 110, ly);
      if (req.completed) {
        const lineW = doc.getTextWidth(line);
        doc.setDrawColor(C.muted);
        doc.setLineWidth(0.4);
        doc.line(MARGIN + 110, ly - 2, MARGIN + 110 + lineW, ly - 2);
      }
    });
    // Date
    if (req.completed && req.dateEarned) {
      setText(doc, "normal", 8, C.muted);
      doc.text(formatDateShort(req.dateEarned), PAGE_W - MARGIN - 6, y, { align: "right" });
    }
    return y + rowH;
  }

  // Merit badges section: in-progress (with progress bar) + earned list
  function drawMeritBadges(doc, y, scout) {
    const mb = scout.meritBadges || { inProgress: [], earned: [] };
    const eagleIp = (mb.inProgress || []).filter((b) => b.isEagle).sort((a, b) => b.pctComplete - a.pctComplete);
    const nonEagleIp = (mb.inProgress || []).filter((b) => !b.isEagle).sort((a, b) => b.pctComplete - a.pctComplete);
    const earned = [...(mb.earned || [])].sort((a, b) => {
      if (a.isEagle !== b.isEagle) return a.isEagle ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    if (!eagleIp.length && !nonEagleIp.length && !earned.length) {
      setText(doc, "italic", 10, C.muted);
      doc.text("No merit badge activity recorded.", MARGIN, y);
      return y + 14;
    }

    if (eagleIp.length) {
      y = drawMbSubheader(doc, y, "Eagle-Required In Progress");
      eagleIp.forEach((b) => { y = drawBadgeBlock(doc, y, b); });
    }
    if (nonEagleIp.length) {
      y = drawMbSubheader(doc, y, "In Progress");
      nonEagleIp.forEach((b) => { y = drawBadgeBlock(doc, y, b); });
    }
    if (earned.length) {
      y = drawMbSubheader(doc, y, "Earned (" + earned.length + ")");
      y = drawEarnedTable(doc, y, earned);
    }
    return y;
  }

  function drawMbSubheader(doc, y, title) {
    y = ensureSpace(doc, y, 22);
    setText(doc, "bold", 11, C.text);
    doc.text(title, MARGIN, y);
    y += 4;
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    return y + 12;
  }

  function drawBadgeBlock(doc, y, b) {
    const total = b.completedCount + b.uncompletedCount;
    const blockH = 50 + (b.comment ? 14 : 0);
    y = ensureSpace(doc, y, blockH);

    // Name + Eagle pill
    setText(doc, "bold", 11, C.text);
    doc.text(b.name, MARGIN, y);
    if (b.isEagle) {
      const nameW = doc.getTextWidth(b.name);
      drawEaglePill(doc, MARGIN + nameW + 8, y);
    }
    y += 12;

    // Progress bar
    const barX = MARGIN;
    const barY = y;
    const barW = CONTENT_W - 160;
    const barH = 6;
    doc.setFillColor(C.bgAlt);
    doc.roundedRect(barX, barY, barW, barH, 3, 3, "F");
    if (b.pctComplete > 0) {
      doc.setFillColor(C.primary);
      doc.roundedRect(barX, barY, barW * Math.min(b.pctComplete, 100) / 100, barH, 3, 3, "F");
    }
    setText(doc, "normal", 9, C.secondary);
    doc.text(
      b.completedCount + " of " + total + " reqs (" + Math.round(b.pctComplete) + "%)",
      PAGE_W - MARGIN, y + 5, { align: "right" }
    );
    y += 14;

    if (b.counselor) {
      setText(doc, "normal", 9, C.secondary);
      doc.text("Counselor: " + b.counselor, MARGIN, y);
      y += 12;
    }
    if (b.comment) {
      setText(doc, "italic", 9, C.muted);
      const lines = doc.splitTextToSize(b.comment, CONTENT_W);
      lines.forEach((line) => {
        y = ensureSpace(doc, y, 12);
        doc.text(line, MARGIN, y);
        y += 11;
      });
      y += 2;
    }
    return y + 6;
  }

  function drawEarnedTable(doc, y, earned) {
    const rowH = 13;
    const colW = CONTENT_W;
    earned.forEach((b, i) => {
      y = ensureSpace(doc, y, rowH);
      if (i % 2 === 1) {
        doc.setFillColor(C.bgAlt);
        doc.rect(MARGIN, y - 10, colW, rowH, "F");
      }
      // Eagle star
      if (b.isEagle) {
        setText(doc, "bold", 10, C.warning);
        doc.text("★", MARGIN + 4, y);
      }
      // Name
      setText(doc, "normal", 9, C.text);
      doc.text(b.name, MARGIN + 18, y);
      // Awarded date
      if (b.awardedDate) {
        setText(doc, "normal", 9, C.muted);
        doc.text(formatDateShort(b.awardedDate), PAGE_W - MARGIN - 6, y, { align: "right" });
      }
      y += rowH;
    });
    return y;
  }

  // Priority actions
  function drawPriorityActions(doc, y, actions) {
    actions.forEach((a, i) => {
      const titleLines = doc.splitTextToSize(a.title || "", CONTENT_W - 36);
      const explLines = doc.splitTextToSize(a.explanation || "", CONTENT_W - 36);
      const extra = (a.counselor ? 12 : 0) + (a.effort ? 12 : 0);
      const blockH = 14 + titleLines.length * 12 + explLines.length * 11 + extra + 10;
      y = ensureSpace(doc, y, blockH);

      const tier = a.tier || 1;
      const tierColor = tier === 1 ? C.t1 : tier === 2 ? C.t2 : C.t3;

      // Number circle
      doc.setFillColor(tierColor);
      doc.circle(MARGIN + 9, y + 3, 9, "F");
      setText(doc, "bold", 10, "#ffffff");
      doc.text(String(i + 1), MARGIN + 9, y + 6, { align: "center" });

      // Title
      setText(doc, "bold", 11, C.text);
      titleLines.forEach((line, j) => {
        doc.text(line, MARGIN + 28, y + 6 + j * 12);
      });
      let py = y + 6 + titleLines.length * 12;

      // Explanation
      setText(doc, "normal", 9, C.secondary);
      explLines.forEach((line) => {
        py += 11;
        doc.text(line, MARGIN + 28, py);
      });

      if (a.counselor) {
        py += 11;
        setText(doc, "normal", 8, C.muted);
        doc.text("Counselor: " + a.counselor, MARGIN + 28, py);
      }
      if (a.effort) {
        py += 11;
        setText(doc, "normal", 8, C.muted);
        doc.text(a.effort, MARGIN + 28, py);
      }
      y = py + 10;
    });
    return y;
  }

  function addFooters(doc, scoutName) {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      setText(doc, "normal", 8, C.muted);
      doc.text(scoutName + " — BSA Advancement Report", MARGIN, FOOTER_Y);
      doc.text("Page " + i + " of " + total, PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
    }
  }

  function formatDateShort(d) {
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date)) return "";
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function pdfFilename(scout) {
    const safe = (scout.displayName || scout.name || "scout")
      .replace(/[^a-z0-9 ]/gi, "_")
      .replace(/\s+/g, "_");
    return safe + "_advancement.pdf";
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  function generateScoutPdf(scout, state) {
    const JsPDF = getJsPDF();
    const doc = new JsPDF({ unit: "pt", format: "letter" });

    let y = MARGIN;

    // ----- Header -----
    setText(doc, "bold", 22, C.text);
    doc.text(scout.displayName || scout.name || "Scout", MARGIN, y);
    setText(doc, "normal", 9, C.muted);
    doc.text(formatDateShort(new Date()), PAGE_W - MARGIN, y, { align: "right" });
    y += 14;
    setText(doc, "normal", 11, C.secondary);
    doc.text("BSA Advancement Report", MARGIN, y);
    y += 14;

    // Meta line
    const meta = [];
    if (scout.age != null) meta.push("Age " + scout.age);
    if (scout.patrol) meta.push("Patrol: " + scout.patrol);
    if (scout.currentRank) meta.push("Current rank: " + scout.currentRank);
    if (scout.nextRank && scout.nextRank !== scout.currentRank) {
      meta.push("Working toward: " + scout.nextRank);
    }
    if (meta.length) {
      setText(doc, "normal", 10, C.text);
      doc.text(meta.join("   ·   "), MARGIN, y);
      y += 12;
    }
    y += 6;
    drawHRule(doc, y);
    y += 16;

    // ----- Metrics -----
    const metrics = [];
    if (state.rankAvailable) {
      metrics.push(["Current Rank", scout.currentRank || "—"]);
      metrics.push([
        "Next Rank",
        (scout.nextRank || "—") + " — " + (scout.totalIncompleteRankReqs || 0) + " reqs"
      ]);
    }
    if (state.badgesAvailable) {
      const earnedCount = (scout.meritBadges && scout.meritBadges.earned.length) || 0;
      metrics.push([
        "Merit Badges Earned",
        earnedCount + " (" + (scout.eagleEarnedCount || 0) + " Eagle)"
      ]);
      metrics.push([
        "Merit Badges In Progress",
        (scout.totalInProgressBadges || 0) + " (" + (scout.eagleInProgressCount || 0) + " Eagle)"
      ]);
    }
    if (metrics.length) {
      y = drawMetricGrid(doc, y, metrics);
      y += 8;
    }

    // ----- Eagle roadmap -----
    if (state.badgesAvailable && scout.eagleRoadmap) {
      y = drawSectionHeader(doc, y, "Eagle Scout Roadmap");
      y = drawEagleRoadmap(doc, y, scout.eagleRoadmap);
    }

    // ----- Rank requirements -----
    if (state.rankAvailable) {
      doc.addPage();
      y = MARGIN;
      y = drawSectionHeader(doc, y, "Rank Requirements");
      y = drawRankRequirements(doc, y, scout);
    }

    // ----- Merit badges -----
    if (state.badgesAvailable) {
      doc.addPage();
      y = MARGIN;
      y = drawSectionHeader(doc, y, "Merit Badges");
      y = drawMeritBadges(doc, y, scout);
    }

    // ----- Priority actions -----
    const actions = scout.priorityActions || [];
    if (actions.length) {
      doc.addPage();
      y = MARGIN;
      y = drawSectionHeader(doc, y, "Prioritized Action Plan");
      y = drawPriorityActions(doc, y, actions);
    }

    addFooters(doc, scout.displayName || scout.name || "Scout");
    return doc;
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

  function downloadScoutPdf(scout, state) {
    const doc = generateScoutPdf(scout, state);
    const blob = doc.output("blob");
    downloadBlob(blob, pdfFilename(scout));
  }

  async function downloadScoutsZip(scouts, state, onProgress) {
    if (!scouts || !scouts.length) throw new Error("No scouts to export");
    const JSZip = getJSZip();
    const zip = new JSZip();
    for (let i = 0; i < scouts.length; i++) {
      const scout = scouts[i];
      if (onProgress) onProgress(i, scouts.length, scout.displayName);
      try {
        const doc = generateScoutPdf(scout, state);
        // Pass an ArrayBuffer to JSZip — Blob ingestion has hangs in some
        // environments, ArrayBuffer is the safest universal input.
        const buf = doc.output("arraybuffer");
        zip.file(pdfFilename(scout), buf);
      } catch (e) {
        console.error("PDF generation failed for", scout.displayName, e);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    if (onProgress) onProgress(scouts.length, scouts.length, null);
    // Generate as uint8array and construct the Blob ourselves — JSZip's
    // direct 'blob' output path has interop issues in some environments.
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const zipBlob = new Blob([bytes], { type: "application/zip" });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(zipBlob, "advancement_reports_" + stamp + ".zip");
  }

  TR.pdf = {
    generateScoutPdf,
    downloadScoutPdf,
    downloadScoutsZip,
    pdfFilename
  };
})();
