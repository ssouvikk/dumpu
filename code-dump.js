#!/usr/bin/env node
/* eslint-disable no-console */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import process from "process";

/**
 * ===============================
 * Configuration (easy to edit)
 * ===============================
 */

// Allowed extensions (lowercase, no dot). Covers major programming & config files
const ALLOWED_EXTENSIONS_STR = [
    "js",
    "jsx",
    "mjs",
    "cjs", // JavaScript
    "ts",
    "tsx", // TypeScript
    "py", // Python
    "php", // PHP
    "rb", // Ruby
    "java",
    "kt",
    "kts",
    "scala",
    "dart",
    "c",
    "cpp",
    "cs", // C#
    "go", // Go
    "rs", // Rust
    "hs", // Haskell
    "sh",
    "bash",
    "zsh",
    "bat",
    "cmd", // Scripts
    "pl",
    "pm", // Perl
    "html",
    "htm",
    "css",
    "scss",
    "sass",
    "less", // Web
    "xml",
    "yaml",
    "yml",
    "toml",
    "ini",
    "json", // Config/Markup
    "sql",
    "psql", // DB
    "csv",
    "tsv", // Data text
    "md",
].join("/");

// Disallowed types (put only if you want to skip specific ones)
const DISALLOWED_TYPES_STR = "";

// Explicitly allowed file basenames (highest priority)
const ALLOWED_FILES_STR = ["Dockerfile", ".gitignore", ".gitattributes", ".editorconfig", ".prettierrc"].join("/");

// Explicitly disallowed basenames
const DISALLOWED_FILES_STR = "package-lock.json/yarn.lock/pnpm-lock.yaml";

// Max file size (in KB). Only files <= this size are included.
let MAX_FILE_SIZE_KB = 200;

// Optional CLI override: --maxKB=250 or --maxKB 250
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--maxKB=")) {
        const v = Number(a.slice("--maxKB=".length));
        if (!Number.isNaN(v) && v > 0) MAX_FILE_SIZE_KB = v;
    } else if (a === "--maxKB") {
        const v = Number(process.argv[i + 1]);
        if (!Number.isNaN(v) && v > 0) MAX_FILE_SIZE_KB = v;
        i++;
    }
}
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_KB * 1024;

/**
 * ===============================
 * Helpers
 * ===============================
 */
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600)
        .toString()
        .padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60)
        .toString()
        .padStart(2, "0");
    const s = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
    return `${h}:${m}:${s}`;
}
function nowSec() {
    return Math.floor(Date.now() / 1000);
}
function isJsTsFile(file) {
    return /\.(jsx?|tsx?)$/i.test(file);
}
function parseListToSets({ allowedExtStr, disallowedTypesStr, disallowedFilesStr, allowedFilesStr }) {
    const normSplit = (s) =>
        (s || "")
            .split("/")
            .map((t) => t.trim())
            .filter(Boolean);

    const allowedExt = new Set(normSplit(allowedExtStr).map((t) => t.toLowerCase().replace(/^\./, "")));

    const disallowedExt = new Set();
    const disallowedFiles = new Set();
    for (const tok of normSplit(disallowedTypesStr)) {
        if (tok.startsWith(".")) {
            disallowedFiles.add(tok); // keep dot for basenames like '.env'
        } else {
            disallowedExt.add(tok.toLowerCase());
        }
    }

    // Merge explicit disallowed basenames
    for (const f of normSplit(disallowedFilesStr)) {
        if (f) disallowedFiles.add(f);
    }

    const allowedFiles = new Set(normSplit(allowedFilesStr));

    return { allowedExt, disallowedExt, disallowedFiles, allowedFiles };
}

function stripJsTsCommentsPreservingCode(src) {
    // NOTE: User requested to NOT skip any lines.
    // Therefore this function intentionally returns the source unchanged.
    // Keeping a named function for backwards compatibility in the code path.
    return src;
}

function getOutputConfig(argv) {
    // supports:
    //   --fileName=mydump
    //   --fileName mydump.md
    //   --format=md|txt (overrides extension inference)
    let base = "completeCodebase.md"; // default name + default format .md
    let format = "md"; // "md" | "txt"
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--fileName=")) {
            base = a.slice("--fileName=".length).trim() || base;
        } else if (a === "--fileName") {
            base = (argv[i + 1] || base).trim();
            i++;
        } else if (a.startsWith("--format=")) {
            const f = a.slice("--format=".length).trim().toLowerCase();
            if (f === "md" || f === "txt") format = f;
        } else if (a === "--format") {
            const f = (argv[i + 1] || "").trim().toLowerCase();
            if (f === "md" || f === "txt") format = f;
            i++;
        }
    }
    base = path.basename(base); // prevent accidental paths
    // If user supplied an extension, infer format from it unless --format was given
    const extMatch = base.match(/\.([a-z0-9]+)$/i);
    if (extMatch) {
        const ext = extMatch[1].toLowerCase();
        if (ext === "md" || ext === "markdown") format = format || "md";
        else if (ext === "txt") format = format || "txt";
    } else {
        // No extension: append by chosen/derived format
        base = `${base}.${format === "txt" ? "txt" : "md"}`;
    }
    return { baseName: base, format };
}

function detectLanguageForFile(file, content) {
    const base = path.basename(file);
    const ext = path.extname(base).toLowerCase().replace(/^\./, ""); // '' if none

    // Special basenames without/with odd extensions
    const specialBaseMap = {
        dockerfile: "dockerfile",
        makefile: "makefile",
        ".gitignore": "gitignore",
        ".gitattributes": "git-attributes",
        ".editorconfig": "ini",
        ".env": "ini",
        ".prettierrc": (() => {
            // try to guess json vs yaml
            try {
                const trimmed = (content || "").trim();
                if (trimmed.startsWith("{")) return "json";
                // .prettierrc can be YAML too
                return "yaml";
            } catch {
                return "json";
            }
        })(),
    };
    if (specialBaseMap[base.toLowerCase()]) {
        return typeof specialBaseMap[base.toLowerCase()] === "function"
            ? specialBaseMap[base.toLowerCase()](content)
            : specialBaseMap[base.toLowerCase()];
    }

    // Wide coverage language map
    const langMap = {
        js: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        php: "php",
        rb: "ruby",
        java: "java",
        kt: "kotlin",
        kts: "kotlin",
        scala: "scala",
        c: "c",
        h: "c",
        cpp: "cpp",
        cc: "cpp",
        cxx: "cpp",
        hpp: "cpp",
        hh: "cpp",
        hxx: "cpp",
        cs: "csharp",
        go: "go",
        rs: "rust",
        hs: "haskell",
        sh: "bash",
        bash: "bash",
        zsh: "bash",
        ksh: "bash",
        ps1: "powershell",
        bat: "bat",
        cmd: "bat",
        pl: "perl",
        pm: "perl",
        html: "html",
        htm: "html",
        css: "css",
        scss: "scss",
        sass: "sass",
        less: "less",
        xml: "xml",
        yaml: "yaml",
        yml: "yaml",
        toml: "toml",
        ini: "ini",
        json: "json",
        sql: "sql",
        psql: "sql",
        csv: "csv",
        tsv: "tsv",
        md: "markdown",
    };

    // No/unknown extension → try a fallback guess
    if (!ext) {
        // Heuristic: if it looks like JSON
        const t = (content || "").trim();
        if (t.startsWith("{") || t.startsWith("[")) return "json";
        return "text";
    }

    return langMap[ext] || "text";
}

// Choose a fence that won't collide with the content (``` vs ```` vs ~~~)
function chooseFenceForContent(content) {
    const hasTripleBackticks = /```/.test(content || "");
    const hasQuadBackticks = /````/.test(content || "");
    if (!hasTripleBackticks) return "```";
    if (!hasQuadBackticks) return "````";
    // Fallback to tildes if multiple backticks present inside content
    return "~~~";
}

// Progress line cleanup on exit/Ctrl+C
let wroteProgress = false;
function writeProgressLine(text) {
    wroteProgress = true;
    process.stdout.write(text);
}
function cleanupProgress() {
    if (wroteProgress) process.stdout.write("\n");
}
process.on("exit", cleanupProgress);
process.on("SIGINT", () => {
    cleanupProgress();
    process.exit(130);
});

/**
 * ===============================
 * (A) Parse args & prepare paths
 * ===============================
 */

const { baseName: BASENAME, format: OUTPUT_FORMAT } = getOutputConfig(process.argv);
const OUTFILE = path.join(os.homedir(), "Downloads", BASENAME);

const { allowedExt, disallowedExt, disallowedFiles, allowedFiles } = parseListToSets({
    allowedExtStr: ALLOWED_EXTENSIONS_STR,
    disallowedTypesStr: DISALLOWED_TYPES_STR,
    disallowedFilesStr: DISALLOWED_FILES_STR,
    allowedFilesStr: ALLOWED_FILES_STR,
});

/**
 * ===============================
 * (B) Ensure inside a Git repo
 * ===============================
 */
try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        stdio: "ignore",
    });
} catch {
    console.error("Error: Not inside a Git repository. cd into your repo and rerun.");
    process.exit(1);
}

/**
 * ===============================
 * (C) List files via git (TRACKED + UNTRACKED, ignore .gitignore), NUL-delimited
 * ===============================
 */
let nulBuf;
try {
    // Tracked files only
    // Tracked + untracked (respects .gitignore / exclude files)
    nulBuf = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
} catch (e) {
    console.error("Error running git ls-files:", e?.message || e);
    process.exit(1);
}

// NUL-delimited -> array
const trackedFiles = nulBuf.toString("utf8").split("\u0000").filter(Boolean);

/**
 * ===============================
 * (C.1) Decide inclusion with reasons & size filter
 * ===============================
 */
function decideInclude(file) {
    // Priority: disallowed basename > disallowed ext > allowed ext list
    const base = path.basename(file);
    const baseLower = base.toLowerCase();
    const extLower = path.extname(baseLower).replace(/^\./, ""); // '' if no ext

    // Explicit disallow by basename (e.g., '.env' if present there)
    if (disallowedFiles.has(base) || disallowedFiles.has(baseLower)) {
        return { include: false, reason: "disallowed basename", size: null };
    }

    // Explicit allow by basename (highest priority vs ext rules; still respect size)
    const isExplicitAllowed = allowedFiles.has(base) || allowedFiles.has(baseLower);

    // Disallow by extension (unless explicitly allowed by basename)
    if (!isExplicitAllowed && extLower && disallowedExt.has(extLower)) {
        return { include: false, reason: `disallowed extension .${extLower}`, size: null };
    }

    // If we have a non-empty allowed extensions set, enforce it (unless explicitly allowed)
    if (!isExplicitAllowed && allowedExt.size > 0) {
        if (!extLower || !allowedExt.has(extLower)) {
            return { include: false, reason: "not in allowed extensions", size: null };
        }
    }

    // Size check (stat once)
    let st;
    try {
        st = fs.statSync(file);
    } catch (e) {
        return {
            include: false,
            reason: `fs.stat error: ${e?.message || String(e)}`,
            size: null,
        };
    }
    const sz = st.size;
    if (sz > MAX_FILE_SIZE_BYTES) {
        return {
            include: false,
            reason: `exceeds size limit (${(sz / 1024).toFixed(1)}KB > ${MAX_FILE_SIZE_KB}KB)`,
            size: sz,
        };
    }

    return { include: true, reason: "", size: sz };
}

const decisions = trackedFiles.map((f) => ({ file: f, ...decideInclude(f) }));
const matched = decisions.filter((d) => d.include).map((d) => d.file);
const skipped = decisions.filter((d) => !d.include);

// Nothing to do?
if (matched.length === 0) {
    console.log(`No matching files found under current rules.
Allowed extensions: ${[...allowedExt].join("/") || "(none)"}
Disallowed extensions: ${[...disallowedExt].join("/") || "(none)"}
Disallowed basenames: ${[...disallowedFiles].join("/") || "(none)"}
Explicitly allowed files: ${[...allowedFiles].join("/") || "(none)"}
Max size: ${MAX_FILE_SIZE_KB}KB`);
    if (skipped.length) {
        console.log("\nSkipped files (reason):");
        for (const s of skipped) {
            console.log(` - ${s.file}  -> ${s.reason}`);
        }
    }
    process.exit(0);
}

console.log(`\nGetting file list from: ${process.cwd()}`);
console.log(`Tracked files: ${trackedFiles.length}`);
console.log(`Included (<= ${MAX_FILE_SIZE_KB}KB): ${matched.length}`);
if (skipped.length) {
    console.log(`Skipped: ${skipped.length}`);
    for (const s of skipped) {
        console.log(` - ${s.file}  -> ${s.reason}`);
    }
}

/**
 * ===============================
 * (D) Build TOC + BODY
 * ===============================
 */
const startTime = nowSec();
let count = 0;

function progress(c, t) {
    const elapsed = nowSec() - startTime;
    const pct = Math.floor((c * 100) / t)
        .toString()
        .padStart(3, " ");
    writeProgressLine(`Processing: ${pct}% (${c}/${t})  Time: ${formatTime(elapsed)}\r`);
}

// Ensure output dir exists (Downloads usually exists, but be safe)
fs.mkdirSync(path.dirname(OUTFILE), { recursive: true });

/**
 * ===============================
 * (E) Instruction block
 * ===============================
 */
const instructionBlock = String.raw`
This file contains the complete codebase dump.
Processing rules (selective, for all scenarios):

- Avoid irrelevant analysis: skip unused or unrelated parts to save tokens and time.
- Always Identify the smallest set of files strictly required for the current question/request/task; do NOT load or analyze the full codebase.
- Always start analysis from the project root or entrypoint; do not assume context or filenames.

- Prefer minimal dependency paths: open only entry points, directly related modules, and immediately required shared utilities.
- Skip unrelated assets, large binaries, tests, and presentation-only files unless explicitly requested.


- If both frontend and backend exist, include only the portions from each side that directly impact the task.

- Performance-first: limit total input/read to 5MB at a time; process larger data in batches.
- For large files, read only necessary line ranges/sections; chunk and stream to avoid OOM and speed up processing.


9) Use the file index / table-of-contents inside the dump to locate relevant files before loading full contents.
7) Follow industry-standard best practices; avoid refactoring or reformatting unless essential to the task.
6) Use package.json only to understand dependencies, scripts, and versions when needed.
10) If there is ambiguity, ask one clear question; otherwise proceed with reasonable assumptions and document them.



18) Use repo-relative paths only in patches; diffs must use standard git prefixes (a/ and b/).
19) Default deliverable: always return answers as a unified, git-apply-able diff. Each hunk MUST include the target file path and explicit original/new line ranges (i.e., @@ -start,count +start,count @@).
20) Include a short metadata comment above each patch with filename, original/new line ranges, and sha(s) for human readability and traceability.
21) Patches must include at least 3 lines of surrounding context by default
`;

// Sort for stability
const sortedFiles = [...matched].sort((a, b) => a.localeCompare(b, "en"));

const ws = fs.createWriteStream(OUTFILE, { encoding: "utf8" });

// Write header & TOC first (Markdown vs Text)
if (OUTPUT_FORMAT === "md") {
    ws.write(`# Codebase Dump\n`);
    ws.write(`\n> Generated at: ${new Date().toISOString()}\n`);
    ws.write(`\n## Processing Rules\n`);
    ws.write("```\n");
    ws.write(instructionBlock);
    ws.write("\n```\n");
    ws.write(`\n## Table of Contents\n`);
    for (const file of sortedFiles) {
        ws.write(`- \`${file}\`\n`);
    }
    ws.write(`\n---\n`);
    ws.write(`\n## Files\n`);
} else {
    ws.write(instructionBlock);
    ws.write("\n\nTABLE OF CONTENTS (file list)\n");
    ws.write("-----------------------------\n");
    for (const file of sortedFiles) {
        ws.write(file + "\n");
    }
    ws.write("\n\n=================================\n\n");
}

for (const file of sortedFiles) {
    count++;
    progress(count, sortedFiles.length);

    let content = "";
    try {
        content = fs.readFileSync(file, "utf8");
    } catch (e) {
        content = `/* Error reading file: ${e?.message || String(e)} */`;
    }

    let finalContent = content;
    if (isJsTsFile(file)) {
        finalContent = stripJsTsCommentsPreservingCode(content);
    }

    if (OUTPUT_FORMAT === "md") {
        const lang = detectLanguageForFile(file, finalContent);
        const fence = chooseFenceForContent(finalContent);
        ws.write(`\n\n### \`${file}\`\n\n`);
        ws.write(fence + (lang && lang !== "text" ? lang : "") + "\n");
        ws.write(finalContent);
        ws.write("\n" + fence + "\n");
    } else {
        ws.write(`\n\n===== FILE: ${file} =====\n`);
        ws.write(finalContent);
    }
}

// finish progress line
cleanupProgress();

// Close stream
ws.end();

/**
 * ===============================
 * (G) Done
 * ===============================
 */
const totalSecs = nowSec() - startTime;
console.log(`\nDone! Output saved to ${OUTFILE}`);
console.log(`Total time:  ${formatTime(totalSecs)}`);
console.log(
    `Config -> AllowedExt: ${[...allowedExt].join("/") || "(none)"} | DisallowedExt: ${[...disallowedExt].join("/") || "(none)"} | DisallowedFiles: ${
        [...disallowedFiles].join("/") || "(none)"
    } | AllowedFiles: ${[...allowedFiles].join("/") || "(none)"} | MaxKB: ${MAX_FILE_SIZE_KB}`
);
