// Fingerprints for the site's files, so browsers keep their saved copies until a file really changes.
//
//   node _tools/stamp.mjs           Stamp every fingerprint (run it before committing a release)
//   node _tools/stamp.mjs --check   Change nothing; fail when a fingerprint is out of date (the pre-commit
//                                   hook runs this: git config core.hooksPath _tools/hooks)
//
// A fingerprint is the first 10 hex digits of the SHA-256 of a file's contents (line endings don't count, so
// Windows' CRLF copies match what's committed). It's stamped in two places:
//   - Every address in a page (.html) or stylesheet (.css) that ends in ?v=, like
//     href="/stylesheet.css?v=..." or url("/Fonts/MainFont-Latin.woff2?v=..."). An address without ?v= is
//     left alone, so add ?v= to a new one to opt it in. A file that doesn't exist yet (like an image still
//     to be made) gets an empty fingerprint until it does.
//   - FILE_VERSIONS in Javascript/Boot.js: every script in Javascript/ and every image in Resources/Sprites/,
//     which pages load through Boot.js's assetUrl.
// Stylesheets are stamped first, since a stylesheet's fingerprint depends on the stamps inside it.
//
// --check reads the files as they're staged for the next commit (git's index), so a commit can't carry a
// fingerprint that doesn't match the files in it. Jekyll (GitHub Pages) doesn't publish folders starting
// with _, so this never reaches the site.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const TEXT_FILES = /\.(html|css|js|mjs|json|svg|txt|xml|webmanifest)$/i;
const STAMPED_LINK = /(["'(])(\/[^"'()?#\r\n]+?)\?v=([A-Za-z0-9._-]*)/g;
const BOOT = "Javascript/Boot.js";
const LOADED_BY_BOOT = /^(Javascript\/[^/]+\.js|Resources\/Sprites\/[^/]+\.(webp|png|svg))$/;

// The site's files (paths from the root, with /): what's staged when checking, what's on disk otherwise
function siteFiles() {
  if (CHECK) {
    return git(["ls-files", "-z"]).toString("utf8").split("\0").filter(Boolean);
  }
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(join(ROOT, folder), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.name === "node_modules") continue;
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk("");
  return files;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
}

const contents = new Map();
function read(path) {
  if (!contents.has(path)) contents.set(path, CHECK ? git(["show", `:${path}`]) : readFileSync(join(ROOT, path)));
  return contents.get(path);
}

const files = new Set(siteFiles());
const exists = (path) => files.has(path) || (!CHECK && existsSync(join(ROOT, path)));

// A file's fingerprint ("" for one that doesn't exist yet). Stylesheets are fingerprinted as stamped.
const stampedText = new Map(); // Path -> its text with every fingerprint up to date
const fingerprints = new Map();
function fingerprint(path) {
  if (!fingerprints.has(path)) {
    let value = "";
    if (exists(path)) {
      const bytes = stampedText.has(path) ? Buffer.from(stampedText.get(path), "utf8") : read(path);
      const normalized = TEXT_FILES.test(path) ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : bytes;
      value = createHash("sha256").update(normalized).digest("hex").slice(0, 10);
    }
    fingerprints.set(path, value);
  }
  return fingerprints.get(path);
}

const missing = new Set();
function stampLinks(text) {
  return text.replace(STAMPED_LINK, (match, quote, address) => {
    let path;
    try { path = decodeURI(address).slice(1); } catch { path = address.slice(1); }
    if (!exists(path)) missing.add(path);
    return `${quote}${address}?v=${fingerprint(path)}`;
  });
}

// Boot.js's FILE_VERSIONS, between its <stamp:files> lines
function stampBoot(text) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const loaded = [...files].filter(path => LOADED_BY_BOOT.test(path) && path !== BOOT).sort();
  const lines = loaded.map(path => `    "/${path}": "${fingerprint(path)}"`);
  const block = `  const FILE_VERSIONS = {${newline}${lines.join("," + newline)}${newline}  };`;
  const pattern = /(\/\/ <stamp:files>[^\r\n]*\r?\n)[\s\S]*?(\r?\n[ \t]*\/\/ <\/stamp:files>)/;
  if (!pattern.test(text)) {
    problems.push(`${BOOT} doesn't have its "// <stamp:files>" and "// </stamp:files>" lines, so its list can't be stamped.`);
    return text;
  }
  return text.replace(pattern, (match, start, end) => start + block + end);
}

const problems = [];

const sheets = [...files].filter(path => /\.css$/i.test(path)).sort();
const pages = [...files].filter(path => /\.html$/i.test(path)).sort();
for (const path of sheets) stampedText.set(path, stampLinks(read(path).toString("utf8")));
for (const path of pages) stampedText.set(path, stampLinks(read(path).toString("utf8")));
if (files.has(BOOT)) stampedText.set(BOOT, stampBoot(read(BOOT).toString("utf8")));

const outOfDate = [...stampedText].filter(([path, text]) => text !== read(path).toString("utf8")).map(([path]) => path);

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
if (CHECK) {
  if (outOfDate.length > 0) {
    console.error(`These files' fingerprints (?v=) don't match the files being committed:\n  ${outOfDate.join("\n  ")}`);
    console.error("Run `node _tools/stamp.mjs`, then add the changed files and commit again.");
    process.exit(1);
  }
} else {
  for (const path of outOfDate) writeFileSync(join(ROOT, path), stampedText.get(path), "utf8");
  console.log(outOfDate.length > 0 ? `Stamped ${outOfDate.length} file${outOfDate.length === 1 ? "" : "s"}:\n  ${outOfDate.join("\n  ")}` : "Every fingerprint is up to date.");
}
if (!CHECK && missing.size > 0) console.log(`Linked but not there yet (they get a fingerprint once they are):\n  ${[...missing].sort().join("\n  ")}`);
