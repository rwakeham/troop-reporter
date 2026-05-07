#!/usr/bin/env node
/* build.js — bundle the modular source + vendored libs into a single
 * self-contained HTML file at dist/troop-reporter.html.
 *
 * Usage:
 *   npm install
 *   node build.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
fs.mkdirSync(DIST, { recursive: true });

const VENDOR = [
  {
    label: "PapaParse 5.4.1",
    cdn: /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/papaparse@[^"]+"><\/script>/,
    path: "node_modules/papaparse/papaparse.min.js"
  },
  {
    label: "SheetJS xlsx 0.18.5",
    cdn: /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx@[^"]+"><\/script>/,
    path: "node_modules/xlsx/dist/xlsx.full.min.js"
  }
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function readVendor(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.error("Missing " + rel + " — run `npm install` first.");
    process.exit(1);
  }
  return fs.readFileSync(full, "utf8");
}

// The HTML parser only ends a <script> on "</script" (and a <style> on
// "</style"). Escape exactly those sequences, leaving regex literals like
// /\s+</g intact.
function escapeForScript(js) {
  return js.replace(/<\/(script)/gi, "<\\/$1");
}
function escapeForStyle(css) {
  return css.replace(/<\/(style)/gi, "<\\/$1");
}

function inlineScript(content, label) {
  const header = label ? "/* " + label + " */\n" : "";
  return "<script>\n" + header + escapeForScript(content) + "\n</script>";
}

function inlineStyle(content) {
  return "<style>\n" + escapeForStyle(content) + "\n</style>";
}

let html = read("index.html");

// Inline external stylesheet
html = html.replace(
  /<link rel="stylesheet" href="styles\.css">/,
  () => inlineStyle(read("styles.css"))
);

// Inline vendored CDN scripts
VENDOR.forEach((v) => {
  if (!v.cdn.test(html)) {
    console.error("Could not find CDN <script> tag for " + v.label);
    process.exit(1);
  }
  html = html.replace(v.cdn, () => inlineScript(readVendor(v.path), v.label));
});

// Inline local JS modules in dependency order
[
  ["js/parse.js",  /<script src="js\/parse\.js"><\/script>/],
  ["js/render.js", /<script src="js\/render\.js"><\/script>/],
  ["js/print.js",  /<script src="js\/print\.js"><\/script>/],
  ["js/app.js",    /<script src="js\/app\.js"><\/script>/]
].forEach(([file, re]) => {
  if (!re.test(html)) {
    console.error("Could not find <script> tag for " + file);
    process.exit(1);
  }
  html = html.replace(re, () => inlineScript(read(file)));
});

const outPath = path.join(DIST, "troop-reporter.html");
fs.writeFileSync(outPath, html);

const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log("Built " + path.relative(ROOT, outPath) + " — " + kb + " KB");
