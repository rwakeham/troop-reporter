/* =========================================================================
   parse.js — CSV/XLSX ingestion + scout record construction
   Exposes: window.TR.parse
   ========================================================================= */

window.TR = window.TR || {};

(function () {
  "use strict";

  const TR = window.TR;

  const RANKS_ADVANCEMENT = [
    "Scout", "Tenderfoot", "Second Class", "First Class",
    "Star", "Life", "Eagle"
  ];

  const EAGLE_REQUIRED_NAMES = [
    "First Aid", "Citizenship in the Community", "Citizenship in the Nation",
    "Citizenship in Society", "Citizenship in the World", "Communication",
    "Cooking", "Personal Fitness", "Emergency Preparedness", "Lifesaving",
    "Environmental Science", "Sustainability", "Personal Management",
    "Swimming", "Hiking", "Cycling", "Camping", "Family Life"
  ];

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  function clean(s) {
    return s == null ? "" : String(s).trim();
  }

  function isBlank(v) {
    if (v == null) return true;
    const s = String(v).trim().toLowerCase();
    return s === "" || s === "nan" || s === "nat" || s === "null";
  }

  function parseDate(v) {
    if (isBlank(v)) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const str = String(v).trim();
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let [, mo, d, y] = m;
      y = +y;
      if (y < 100) y += y < 70 ? 2000 : 1900;
      const dt = new Date(y, +mo - 1, +d);
      return isNaN(dt) ? null : dt;
    }
    const iso = Date.parse(str);
    return isNaN(iso) ? null : new Date(iso);
  }

  function cleanBadgeName(name) {
    return clean(name).replace(/^\*+/, "").trim();
  }

  function stripYearSuffix(name) {
    return clean(name).replace(/\s*\(.*?\)\s*$/, "").trim();
  }

  function isEagleRequired(row) {
    if (clean(row.Eagle).toLowerCase() === "yes") return true;
    if (clean(row["Merit Badge"]).startsWith("*")) return true;
    return false;
  }

  function cleanCounselor(counselor, badgeName) {
    if (isBlank(counselor)) return null;
    const baseName = stripYearSuffix(cleanBadgeName(badgeName));
    if (!baseName) return clean(counselor);
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\s*-\\s*" + escaped + ".*$", "i");
    return clean(counselor).replace(re, "").trim();
  }

  function displayName(scout) {
    const parts = clean(scout).split(",");
    if (parts.length < 2) return clean(scout);
    return parts[1].trim() + " " + parts[0].trim();
  }

  // ---------------------------------------------------------------------
  // File reading
  // ---------------------------------------------------------------------

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const ext = file.name.split(".").pop().toLowerCase();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read " + file.name));

      if (ext === "csv") {
        reader.onload = (e) => {
          try {
            const result = Papa.parse(e.target.result, {
              header: true,
              skipEmptyLines: true,
              transformHeader: (h) => h.replace(/^﻿/, "").trim()
            });
            resolve({ rows: result.data, name: file.name });
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsText(file);
      } else if (ext === "xlsx" || ext === "xls") {
        reader.onload = (e) => {
          try {
            const wb = XLSX.read(e.target.result, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
            const rows = rawRows.map((row) => {
              const out = {};
              for (const k in row) {
                out[k.replace(/^﻿/, "").trim()] = row[k];
              }
              return out;
            });
            resolve({ rows, name: file.name });
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        reject(new Error("Unsupported file type: ." + ext));
      }
    });
  }

  function identifyFile(rows) {
    if (!rows || !rows.length) return "unknown";
    const cols = new Set(Object.keys(rows[0]));
    const rankCols = ["Scout", "Current Rank", "Rank", "Code", "Requirement", "Date Earned"];
    const mbCols = ["Scout", "Merit Badge", "Completed Requirements", "Uncompleted Requirements", "Eagle"];
    if (rankCols.every((c) => cols.has(c))) return "rank_requirements";
    if (mbCols.every((c) => cols.has(c))) return "merit_badges";
    return "unknown";
  }

  // ---------------------------------------------------------------------
  // Parsing per scout
  // ---------------------------------------------------------------------

  function parseRankForScout(rows) {
    if (!rows.length) {
      return {
        currentRank: null, nextRank: null, age: null, patrol: null,
        incompleteRanks: {}, completedRanks: []
      };
    }
    const currentRank = clean(rows[0]["Current Rank"]) || null;
    const ageRaw = rows[0]["Age"];
    const age = ageRaw != null && ageRaw !== "" ? parseInt(ageRaw, 10) : null;
    const patrol = clean(rows[0]["Patrol"]) || null;

    let nextRank = "Scout";
    if (currentRank && RANKS_ADVANCEMENT.includes(currentRank)) {
      const idx = RANKS_ADVANCEMENT.indexOf(currentRank);
      nextRank = idx + 1 < RANKS_ADVANCEMENT.length ? RANKS_ADVANCEMENT[idx + 1] : "Eagle";
    } else if (currentRank) {
      nextRank = null;
    }

    const incompleteRanks = {};
    const completedRanks = [];

    RANKS_ADVANCEMENT.forEach((rank) => {
      const rankRows = rows.filter((r) => clean(r.Rank) === rank);
      if (!rankRows.length) return;
      const incomplete = rankRows.filter((r) => isBlank(r["Date Earned"]));
      const complete = rankRows.filter((r) => !isBlank(r["Date Earned"]));

      if (incomplete.length === 0 && complete.length > 0) {
        completedRanks.push(rank);
      } else if (incomplete.length > 0) {
        incompleteRanks[rank] = {
          reqs: incomplete.map((r) => ({
            code: clean(r.Code),
            text: clean(r.Requirement)
          })),
          count: incomplete.length,
          completedCount: complete.length
        };
      }
    });

    return { currentRank, nextRank, age, patrol, incompleteRanks, completedRanks };
  }

  function parseMbForScout(rows) {
    const earned = [];
    const inProgress = [];

    rows.forEach((row) => {
      const completed = parseInt(row["Completed Requirements"], 10) || 0;
      const uncompleted = parseInt(row["Uncompleted Requirements"], 10) || 0;
      const total = completed + uncompleted;
      const startedDate = parseDate(row["Started"]);
      const earnedDate = parseDate(row["Earned"]);
      const awardedDate = parseDate(row["Awarded"]);

      const counselor = !isBlank(row["Merit Badge Counselor"])
        ? cleanCounselor(row["Merit Badge Counselor"], row["Merit Badge"])
        : null;
      const comment = !isBlank(row["Comment"]) ? clean(row["Comment"]) : null;

      const entry = {
        name: cleanBadgeName(row["Merit Badge"]),
        rawName: clean(row["Merit Badge"]),
        isEagle: isEagleRequired(row),
        completedCount: completed,
        uncompletedCount: uncompleted,
        pctComplete: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
        counselor,
        comment,
        startedDate,
        earnedDate,
        awardedDate
      };

      if (awardedDate) {
        earned.push(entry);
      } else if (!earnedDate && !awardedDate && startedDate && total > 0) {
        inProgress.push(entry);
      }
    });

    return {
      earned,
      inProgress,
      eagleInProgressCount: inProgress.filter((b) => b.isEagle).length,
      nonEagleInProgressCount: inProgress.filter((b) => !b.isEagle).length,
      eagleEarnedCount: earned.filter((b) => b.isEagle).length,
      nonEagleEarnedCount: earned.filter((b) => !b.isEagle).length
    };
  }

  function computeEagleRoadmap(mbInfo, allMbRows) {
    const startedNames = new Set();
    allMbRows.forEach((row) => {
      if (!isBlank(row["Started"])) {
        startedNames.add(stripYearSuffix(cleanBadgeName(row["Merit Badge"])));
      }
    });
    const unstartedEagle = EAGLE_REQUIRED_NAMES.filter((n) => !startedNames.has(n));
    const totalEarned = mbInfo.earned.length;
    return {
      eagleBadgesEarned: mbInfo.eagleEarnedCount,
      eagleBadgesInProgress: mbInfo.eagleInProgressCount,
      eagleBadgesNotStarted: unstartedEagle.length,
      nonEagleBadgesEarned: mbInfo.nonEagleEarnedCount,
      totalBadgesEarned: totalEarned,
      badgesNeededForEagle: Math.max(0, 21 - totalEarned),
      unstartedEagleBadges: unstartedEagle
    };
  }

  function generatePriorityActions(scout) {
    const actions = [];
    const inProgress = (scout.meritBadges && scout.meritBadges.inProgress) || [];

    // Tier 1: Eagle-required badges closest to completion
    const eagleNear = inProgress
      .filter((b) => b.isEagle && b.uncompletedCount > 0)
      .sort((a, b) => a.uncompletedCount - b.uncompletedCount)
      .slice(0, 2);

    eagleNear.forEach((badge) => {
      const total = badge.completedCount + badge.uncompletedCount;
      actions.push({
        tier: 1,
        title: "Finish " + badge.name,
        explanation:
          "Eagle-required — " + badge.completedCount + " of " + total +
          " reqs complete (" + Math.round(badge.pctComplete) + "%)",
        counselor: badge.counselor || null,
        effort: badge.uncompletedCount + " requirements remaining"
      });
    });

    // Tier 1: Next rank within reach
    const nextRank = scout.nextRank;
    const remaining = (scout.incompleteRanks && scout.incompleteRanks[nextRank]
      && scout.incompleteRanks[nextRank].count) || 0;
    if (nextRank && remaining > 0 && remaining <= 5) {
      actions.push({
        tier: 1,
        title: "Complete " + nextRank + " rank",
        explanation: "Only " + remaining + " requirement" + (remaining === 1 ? "" : "s") + " left",
        effort: remaining + " requirements remaining"
      });
    }

    // Tier 2: Active Eagle badges with counselor (not already in tier 1)
    const eagleNearSet = new Set(eagleNear.map((b) => b.name));
    inProgress
      .filter((b) => b.isEagle && b.counselor && !eagleNearSet.has(b.name))
      .slice(0, 2)
      .forEach((badge) => {
        actions.push({
          tier: 2,
          title: "Continue " + badge.name,
          explanation:
            "Eagle-required — " + Math.round(badge.pctComplete) +
            "% complete, counselor " + badge.counselor + " already assigned",
          counselor: badge.counselor
        });
      });

    // Tier 2: Next rank with more work ahead
    if (nextRank && remaining > 5) {
      actions.push({
        tier: 2,
        title: "Work toward " + nextRank + " rank",
        explanation: remaining + " requirements remaining"
      });
    }

    // Tier 3: Unstarted Eagle-required badges
    ((scout.eagleRoadmap && scout.eagleRoadmap.unstartedEagleBadges) || [])
      .slice(0, 3)
      .forEach((name) => {
        actions.push({
          tier: 3,
          title: "Plan for " + name,
          explanation: "Eagle-required — not yet started"
        });
      });

    return actions.slice(0, 7);
  }

  // ---------------------------------------------------------------------
  // Build full dataset
  // ---------------------------------------------------------------------

  function normalizeRows(rows) {
    return (rows || []).map((r) => {
      const out = {};
      for (const k in r) {
        const v = r[k];
        out[k] = typeof v === "string" ? v.trim() : v;
      }
      out.Scout = clean(r.Scout);
      if ("Code" in r) out.Code = clean(r.Code);
      return out;
    });
  }

  function buildScoutRecords(rankRows, mbRows) {
    const rRows = normalizeRows(rankRows);
    const mRows = normalizeRows(mbRows);

    const rByScout = {};
    rRows.forEach((r) => {
      if (!r.Scout) return;
      (rByScout[r.Scout] = rByScout[r.Scout] || []).push(r);
    });
    const mByScout = {};
    mRows.forEach((r) => {
      if (!r.Scout) return;
      (mByScout[r.Scout] = mByScout[r.Scout] || []).push(r);
    });

    const allScoutNames = new Set([...Object.keys(rByScout), ...Object.keys(mByScout)]);
    const scouts = {};

    allScoutNames.forEach((name) => {
      const rankInfo = parseRankForScout(rByScout[name] || []);
      const mbInfo = parseMbForScout(mByScout[name] || []);
      const roadmap = computeEagleRoadmap(mbInfo, mByScout[name] || []);
      const record = {
        name,
        displayName: displayName(name),
        ...rankInfo,
        meritBadges: mbInfo,
        eagleRoadmap: roadmap,
        hasRankData: (rByScout[name] || []).length > 0,
        hasMbData: (mByScout[name] || []).length > 0
      };
      record.priorityActions = generatePriorityActions(record);
      record.totalIncompleteRankReqs =
        (record.incompleteRanks[record.nextRank] && record.incompleteRanks[record.nextRank].count) || 0;
      record.totalInProgressBadges = mbInfo.inProgress.length;
      record.eagleInProgressCount = mbInfo.eagleInProgressCount;
      record.eagleEarnedCount = mbInfo.eagleEarnedCount;
      scouts[name] = record;
    });

    const patrols = {};
    Object.values(scouts).forEach((s) => {
      const p = s.patrol || "Unassigned";
      (patrols[p] = patrols[p] || []).push(s.name);
    });
    Object.keys(patrols).forEach((p) => patrols[p].sort());

    return { scouts, patrols };
  }

  // ---------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------

  TR.parse = {
    readFile,
    identifyFile,
    buildScoutRecords,
    RANKS_ADVANCEMENT,
    EAGLE_REQUIRED_NAMES
  };
})();
