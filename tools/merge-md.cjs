#!/usr/bin/env node
// LLM-optimized Markdown merger with Git metadata, headings outline, link graph,
// text-diagram embedding (SVG/Draw.io), and JSONL chunks.
//
// Defaults to --mode llm (strip ToC, no binary assets, embed .svg/.drawio as text).
//
// Usage:
//   node tools/merge-md.js                               # CWD -> <bundle_id>.md (LLM mode)
//   node tools/merge-md.js <startDir> [outPathOrDir]
//   node tools/merge-md.js --mode llm --root . ../bundles/
//
// Flags:
//   --mode llm|human             (default: llm)
//   --root                       Detect repo root (looks for .git or package.json).
//   --include-ext ".md,.markdown,.mdx"
//   --ignore "**/drafts/**,**/archive/**"
//   --strip-toc                  Force ToC stripping (auto-on in llm mode).
//   --chunk                      Chunk big files (recommended).
//   --max-chars 20000            Max chars per chunk when --chunk.
//   --no-rewrite-links           Keep relative links untouched (not recommended).
//   --assets copy|inline|none    (human mode default: copy; llm mode default: none)
//   --assets-dir "assets"        Output folder for copied assets (human mode).
//   --include-img-ext ".png,.jpg,.jpeg,.gif,.webp,.svg"
//   --embed-svg                  Embed raw <svg> when referenced (auto-on in llm mode).
//   --embed-drawio               Embed raw .drawio XML when referenced (auto-on in llm mode).
//   --no-git                     Disable Git metadata collection.
//   --help

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ---------- Defaults ----------
const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.cache',
  '.svelte-kit', '.expo', 'out', 'coverage', '.venv', 'venv', '__pycache__'
]);
const DEFAULT_MARKDOWN_EXTS = new Set(['.md', '.markdown', '.mdx']);
const DEFAULT_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const DRAWIO_EXT = '.drawio';

// ---------- Small helpers ----------
function toPosix(p) { return p.split(path.sep).join('/'); }
function toSlug(s) {
  return s.toLowerCase()
    .replace(/[^\w\-\/. ]+/g, '')
    .replace(/[\/. ]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
function makeBoundary(relPath) { return `file-${toSlug(toPosix(relPath))}`; }
async function ensureDir(dir) { if (!fsSync.existsSync(dir)) await fs.mkdir(dir, { recursive: true }); }
function globToRegExp(glob) {
  const special = /[.+^${}()|[\]\\]/g; let re = ''; let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') { if (glob[i + 1] === '*') { re += '.*'; i += 2; } else { re += '[^/]*'; i += 1; } }
    else if (c === '?') { re += '.'; i += 1; }
    else { re += c.replace(special, '\\$&'); i += 1; }
  }
  return new RegExp('^' + re + '$');
}
function parseArgs(argv) {
  const out = { flags: {}, positionals: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (a === '--help') { out.flags.help = true; continue; }
      if (a === '--root') { out.flags.root = true; continue; }
      if (a === '--strip-toc') { out.flags.stripToc = true; continue; }
      if (a === '--chunk') { out.flags.chunk = true; continue; }
      if (a === '--no-rewrite-links') { out.flags.noRewrite = true; continue; }
      if (a === '--embed-svg') { out.flags.embedSvg = true; continue; }
      if (a === '--embed-drawio') { out.flags.embedDrawio = true; continue; }
      if (a === '--no-git') { out.flags.noGit = true; continue; }
      const next = argv[i + 1];
      if (a === '--mode' && next) { out.flags.mode = next; i++; continue; }
      if (a === '--include-ext' && next) { out.flags.includeExt = next; i++; continue; }
      if (a === '--ignore' && next) { out.flags.ignore = next; i++; continue; }
      if (a === '--max-chars' && next) { out.flags.maxChars = parseInt(next, 10); i++; continue; }
      if (a === '--assets' && next) { out.flags.assets = next; i++; continue; }
      if (a === '--assets-dir' && next) { out.flags.assetsDir = next; i++; continue; }
      if (a === '--include-img-ext' && next) { out.flags.includeImgExt = next; i++; continue; }
    } else {
      out.positionals.push(a);
    }
  }
  return out;
}
function printHelp() {
  console.log(`merge-md.js help
Usage:
  node tools/merge-md.js [startDir] [outFileOrDir]
  node tools/merge-md.js --mode llm --root . ../bundles/
Flags:
  --mode llm|human            (default: llm)
  --root                      Use repo root (detect .git or package.json).
  --include-ext ".md,.markdown,.mdx"
  --ignore "**/drafts/**,**/archive/**"
  --strip-toc                 Remove "Table of Contents" sections.
  --chunk                     Chunk large files.
  --max-chars 20000           Max chars per chunk with --chunk.
  --no-rewrite-links          Do not rewrite relative md links.
  --assets copy|inline|none   (human default: copy, llm default: none)
  --assets-dir "assets"       Where copied images go (human mode).
  --include-img-ext ".png,.jpg,.jpeg,.gif,.webp,.svg"
  --embed-svg                 Embed raw <svg>.
  --embed-drawio              Embed raw .drawio XML.
  --no-git                    Disable Git metadata collection.
  --help`);
}
function findRepoRoot(dir) {
  let cur = dir;
  for (;;) {
    if (fsSync.existsSync(path.join(cur, '.git')) || fsSync.existsSync(path.join(cur, 'package.json'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return dir;
    cur = parent;
  }
}
let startDirGlobal = process.cwd();
async function walkDir(dir, includeExts, ignoredDirs, ignoreRegexes, collected = []) {
  let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return collected; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(startDirGlobal, full);
    const posixRel = toPosix(rel);
    if (ignoreRegexes.some(rx => rx.test(posixRel))) continue;
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) await walkDir(full, includeExts, ignoredDirs, ignoreRegexes, collected);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (includeExts.has(ext)) collected.push(full);
    }
  }
  return collected;
}
function sortPaths(a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }
async function computeMeta(filePath, content) {
  const stat = await fs.lstat(filePath).catch(() => ({ mtime: new Date() }));
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const wordCount = (content.match(/\S+/g) || []).length;
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(filePath);
  return { title, lastModified: (stat.mtime || new Date()).toISOString(), sha256: hash, wordCount };
}
function stripTocSections(md) {
  const rx = /(^ {0,3}#{1,6}[^\n]*\btable of contents\b[^\n]*\n)([\s\S]*?)(?=^ {0,3}#{1,6}\s|\Z)/gmi;
  return md.replace(rx, '');
}
// return {content, headings}
function addHeadingAnchorsAndCollect(md, fileId) {
  const lines = md.split('\n'); let inFence = false; const out = []; const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) { inFence = !inFence; out.push(line); continue; }
    if (!inFence) {
      const m = line.match(/^ {0,3}(#{1,6})\s+(.*)$/);
      if (m) {
        const level = m[1].length;
        const text = m[2].replace(/\s+#*$/, '').trim();
        const anchor = `${fileId}--${toSlug(text)}`;
        out.push(`<a id="${anchor}"></a>`);
        out.push(line);
        headings.push({ level, text, anchor });
        continue;
      }
    }
    out.push(line);
  }
  out.unshift(`<a id="${fileId}"></a>`);
  headings.unshift({ level: 1, text: '(file)', anchor: fileId });
  return { content: out.join('\n'), headings };
}
function buildIdMap(files, baseDir) {
  const map = new Map();
  for (const f of files) {
    const rel = toPosix(path.relative(baseDir, f));
    map.set(rel, makeBoundary(rel));
  }
  return map;
}
function collectOutlinks(md, currentRel) {
  const out = [];
  const rx = /(?<!\!)\[(.*?)\]\((.*?)\)/g;
  let m;
  while ((m = rx.exec(md)) !== null) {
    const href = (m[2] || '').trim();
    if (/^(https?:|mailto:|tel:|#|data:)/i.test(href)) continue;
    const [targetPath, anchorPart] = href.split('#');
    const resolved = toPosix(path.normalize(path.join(path.dirname(currentRel), targetPath)));
    out.push({ target: resolved, anchor: anchorPart ? toSlug(anchorPart) : null });
  }
  return out;
}
function rewriteMarkdownLinks(md, currentRel, currentFileId, idMap, includeExts) {
  return md.replace(/(!)?\[(.*?)\]\((.*?)\)/g, (full, bang, text, href) => {
    if (bang) return full;
    const raw = href.trim();
    if (/^(https?:|mailto:|tel:)/i.test(raw)) return full;
    if (raw.startsWith('#')) {
      const anchor = raw.slice(1); if (!anchor) return full;
      return `[${text}](#${currentFileId}--${toSlug(anchor)})`;
    }
    const [targetPath, anchorPart] = raw.split('#');
    const ext = path.extname(targetPath).toLowerCase();
    if (!includeExts.has(ext)) return full;
    const curDir = path.dirname(currentRel);
    const resolved = toPosix(path.normalize(path.join(curDir, targetPath)));
    const targetId = idMap.get(resolved); if (!targetId) return full;
    const anchor = anchorPart ? `--${toSlug(anchorPart)}` : '';
    return `[${text}](#${targetId}${anchor})`;
  });
}

// --- Image & diagram handling ---
async function readSvgOrDrawioIfText(absPath, maxBytes = 10 * 1024 * 1024) {
  try {
    const stat = await fs.lstat(absPath);
    if (!stat.isFile() || stat.size > maxBytes) return null;

    const fh = await fs.open(absPath, 'r');
    const headSize = Math.min(stat.size, 65536);
    const headBuf = Buffer.alloc(headSize);
    await fh.read(headBuf, 0, headSize, 0);

    if (headBuf.includes(0)) { await fh.close(); return null; }

    const headText = headBuf.toString('utf8');
    const isSvg = /<svg[\s>]/i.test(headText);
    const isDrawio = /<mxfile[\s>]/i.test(headText);

    if (!isSvg && !isDrawio) { await fh.close(); return null; }

    const fullBuf = Buffer.alloc(stat.size);
    await fh.read(fullBuf, 0, stat.size, 0);
    await fh.close();
    const fullText = fullBuf.toString('utf8');

    return isSvg ? { kind: 'svg', text: fullText } : { kind: 'drawio', text: fullText };
  } catch {
    return null;
  }
}
function replaceBinaryImagesWithMarkers(md, currentRel, startDir, includeImgExts) {
  return md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, inside) => {
    let inner = inside.trim();
    if (inner.startsWith('<') && inner.endsWith('>')) inner = inner.slice(1, -1);
    const mTitle = inner.match(/^(\S+)\s+"[^"]*"\s*$/);
    const urlOnly = mTitle ? mTitle[1] : inner;
    if (/^(https?:|data:|mailto:|tel:)/i.test(urlOnly)) return full;
    const ext = path.extname(urlOnly).toLowerCase();
    if (!includeImgExts.has(ext)) return full;
    if (ext === '.svg' || ext === DRAWIO_EXT) return full; // text diagrams handled elsewhere
    const curDir = path.dirname(currentRel);
    const resolvedRel = toPosix(path.normalize(path.join(curDir, urlOnly)));
    const absSrc = path.resolve(startDir, resolvedRel);
    const exists = fsSync.existsSync(absSrc) && fsSync.statSync(absSrc).isFile();
    const size = exists ? fsSync.statSync(absSrc).size : null;
    return `\n> [IMAGE] ${resolvedRel}${size != null ? ` (${size} bytes)` : ''}${alt ? ` — alt: "${alt}"` : ''}\n`;
  });
}
async function embedTextDiagrams(md, currentRel, startDir, opts) {
  async function maybeEmbed(href) {
    if (/^(https?:|data:|mailto:|tel:|#)/i.test(href)) return null;
    const curDir = path.dirname(currentRel);
    const resolvedRel = toPosix(path.normalize(path.join(curDir, href)));
    const absSrc = path.resolve(startDir, resolvedRel);
    if (!fsSync.existsSync(absSrc) || !fsSync.statSync(absSrc).isFile()) return null;

    const sniff = await readSvgOrDrawioIfText(absSrc);
    if (!sniff) return null;

    if (sniff.kind === 'svg' && !opts.embedSvg) return null;
    if (sniff.kind === 'drawio' && !opts.embedDrawio) return null;

    const fence = sniff.kind === 'svg' ? 'svg' : 'xml';
    return `\n<!-- EMBED:${resolvedRel} -->\n\`\`\`${fence}\n${sniff.text.trimEnd()}\n\`\`\`\n<!-- /EMBED -->\n`;
  }

  // images
  let out = ''; let last = 0;
  const imgRx = /!\[([^\]]*)\]\(([^)]+)\)/g; let m;
  while ((m = imgRx.exec(md)) !== null) {
    out += md.slice(last, m.index);
    let inner = m[2].trim();
    if (inner.startsWith('<') && inner.endsWith('>')) inner = inner.slice(1, -1);
    const t = inner.match(/^(\S+)(\s+"[^"]*"\s*)?$/); const href = t ? t[1] : inner;
    const embed = await maybeEmbed(href);
    out += m[0];
    if (embed) out += embed;
    last = imgRx.lastIndex;
  }
  out += md.slice(last);

  // links
  let out2 = ''; last = 0;
  const linkRx = /(?<!\!)\[(.*?)\]\((.*?)\)/g;
  while ((m = linkRx.exec(out)) !== null) {
    out2 += out.slice(last, m.index);
    const href = (m[2] || '').trim();
    const embed = await maybeEmbed(href);
    out2 += m[0];
    if (embed) out2 += embed;
    last = linkRx.lastIndex;
  }
  out2 += out.slice(last);
  return out2;
}
function tokensEstimate(str) { return Math.max(1, Math.round(str.length / 4)); }

// --- Git helpers ---
function tryGit(cmd, cwd) {
  try { return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return null; }
}
function getGitRepoInfo(repoRoot) {
  const hasGit = fsSync.existsSync(path.join(repoRoot, '.git'));
  if (!hasGit) return { enabled: false };
  const headSha = tryGit('git rev-parse HEAD', repoRoot);
  const branch = tryGit('git rev-parse --abbrev-ref HEAD', repoRoot);
  const origin = tryGit('git config --get remote.origin.url', repoRoot);
  const headDate = tryGit('git show -s --format=%cI HEAD', repoRoot);
  const dirty = !!(tryGit('git status --porcelain', repoRoot) || '').length;
  const userName = tryGit('git config user.name', repoRoot);
  const userEmail = tryGit('git config user.email', repoRoot);
  const top = tryGit('git rev-parse --show-toplevel', repoRoot) || repoRoot;
  return {
    enabled: true,
    root: top,
    origin, branch,
    head_sha: headSha,
    head_date: headDate,
    dirty,
    user_name: userName,
    user_email: userEmail
  };
}
function getGitFileInfo(repoRoot, relPath) {
  const ls = tryGit(`git ls-files --stage -- "${relPath}"`, repoRoot);
  const tracked = !!ls;
  const stRaw = tryGit(`git status --porcelain=1 -- "${relPath}"`, repoRoot) || '';
  const status = stRaw ? stRaw.slice(0, 2).trim() : (tracked ? '' : '??');
  const log = tryGit(`git log -1 --format=%H|%cI|%an|%ae -- "${relPath}"`, repoRoot) || '';
  let last_commit = null, last_date = null, author_name = null, author_email = null;
  if (log) [last_commit, last_date, author_name, author_email] = log.split('|');
  return { tracked, status, last_commit, last_date, author_name, author_email };
}
// --- Git front-matter helper
function pushGitFrontMatter(parts, gitFile) {
  parts.push(`git_tracked: ${!!gitFile.tracked}\n`);
  if (gitFile.status) parts.push(`git_status: ${gitFile.status}\n`);
  if (gitFile.last_commit) {
    parts.push(`git_last_commit: ${gitFile.last_commit}\n`);
    if (gitFile.last_date) parts.push(`git_last_date: ${gitFile.last_date}\n`);
    if (gitFile.author_name || gitFile.author_email) {
      parts.push(`git_author: ${gitFile.author_name || ''}${gitFile.author_email ? ` <${gitFile.author_email}>` : ''}\n`);
    }
  }
}

// ---------- Main ----------
async function main() {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);
  if (flags.help) { printHelp(); return; }

  const mode = (flags.mode || 'llm').toLowerCase();
  const startBase = path.resolve(positionals[0] || process.cwd());
  const startDir = flags.root ? findRepoRoot(startBase) : startBase;
  startDirGlobal = startDir;

  const includeExts = new Set(
    (flags.includeExt ? flags.includeExt.split(',') : Array.from(DEFAULT_MARKDOWN_EXTS))
      .map(s => s.trim().toLowerCase())
  );
  const includeImgExts = new Set(
    (flags.includeImgExt ? flags.includeImgExt.split(',') : Array.from(DEFAULT_IMAGE_EXTS))
      .map(s => s.trim().toLowerCase())
  );

  // Mode-driven defaults
  const stripToc = flags.stripToc || mode === 'llm';
  const embedSvg = flags.embedSvg || mode === 'llm';
  const embedDrawio = flags.embedDrawio || mode === 'llm';
  const assetMode = (flags.assets || (mode === 'human' ? 'copy' : 'none')).toLowerCase();

  // Git (repo) + bundleId (can be computed before file discovery)
  const gitEnabled = !flags.noGit;
  const repoGit = gitEnabled ? getGitRepoInfo(startDir) : { enabled: false };
  const bundleId = `bundle-${toSlug((repoGit.enabled && (repoGit.origin || repoGit.root)) || startDir)}-${(repoGit.head_sha || 'n/a').slice(0,12)}`;

  // ----- Resolve output paths (bundle_id-based by default) -----
  const outArg = positionals[1]; // may be undefined, a dir, or a file
  let outDir, outFile;
  if (!outArg) {
    outDir = process.cwd();
    outFile = path.resolve(outDir, `${bundleId}.md`);
  } else {
    const abs = path.resolve(outArg);
    const isDir = (fsSync.existsSync(abs) && fsSync.statSync(abs).isDirectory()) || /[\\\/]$/.test(outArg);
    if (isDir) {
      outDir = abs;
      await ensureDir(outDir);
      outFile = path.join(outDir, `${bundleId}.md`);
    } else {
      outFile = abs;
      outDir = path.dirname(outFile);
    }
  }
  const base = outFile.replace(/\.mdx?$/i, '');
  const outIndexFile = `${base}_INDEX.json`;
  const outChunksFile = `${base}_CHUNKS.jsonl`;

  // Discover files
  let files = await walkDir(startDir, includeExts, new Set(DEFAULT_IGNORED_DIRS), []);
  // Apply --ignore after discovery to keep logic simple
  const ignoreRegexes = [];
  if (flags.ignore) for (const p of flags.ignore.split(',').map(s => s.trim()).filter(Boolean)) ignoreRegexes.push(globToRegExp(p));
  if (ignoreRegexes.length) {
    files = files.filter(f => !ignoreRegexes.some(rx => rx.test(toPosix(path.relative(startDir, f)))));
  }
  files = files.map(f => path.resolve(f)).sort(sortPaths);

  // Avoid self-inclusion
  const excludeAbs = new Set([outFile, outIndexFile, outChunksFile].map(p => path.resolve(p)));
  files = files.filter(f => !excludeAbs.has(path.resolve(f)));

  const idMap = buildIdMap(files, startDir);

  const now = new Date().toISOString();
  const parts = [];
  const index = [];
  const chunksOut = [];

  // --- Machine-first header (no human H1) ---
  const bundleMeta = {
    generated: now,
    mode,
    start_dir: startDir,
    files: files.length,
    git: repoGit.enabled ? {
      origin: repoGit.origin, branch: repoGit.branch, head_sha: repoGit.head_sha,
      head_date: repoGit.head_date, dirty: repoGit.dirty,
      user_name: repoGit.user_name, user_email: repoGit.user_email
    } : null,
    bundle_id: bundleId
  };
  parts.push(`<!-- BUNDLE_META\n${JSON.stringify(bundleMeta, null, 2)}\n-->\n`);
  parts.push(`<a id="${bundleId}"></a>\n`);

  // Optional visible header only in human mode
  if (mode === 'human') {
    parts.push(`---\n`);
    parts.push(`> Generated: ${now}\n`);
    parts.push(`> Mode: ${mode}\n`);
    parts.push(`> Start directory: ${startDir}\n`);
    if (repoGit.enabled) {
      parts.push(`> Repo: ${repoGit.origin || repoGit.root}\n`);
      parts.push(`> Branch: ${repoGit.branch || '(detached)'} @ ${repoGit.head_sha ? repoGit.head_sha.slice(0, 12) : 'n/a'} ${repoGit.dirty ? '(dirty)' : ''}\n`);
      if (repoGit.head_date) parts.push(`> HEAD date: ${repoGit.head_date}\n`);
    }
    parts.push(`> Files: ${files.length}\n\n`);
    parts.push(`---\n`);
  }

  // Process files
  for (const f of files) {
    const rel = toPosix(path.relative(startDir, f));
    const id = makeBoundary(rel);

    let content;
    try {
      content = await fs.readFile(f, 'utf8');
    } catch (err) {
      const meta = await computeMeta(f, '');
      const gitFile = repoGit.enabled ? getGitFileInfo(startDir, rel) : { tracked: false };
      parts.push(`\n<!-- FILE_START id:${id} path:${rel} -->\n`);
      parts.push('---\n');
      parts.push(`source_path: ${rel}\n`);
      parts.push(`title: ${path.basename(f)}\n`);
      parts.push(`last_modified: ${meta.lastModified}\n`);
      parts.push(`sha256: ${meta.sha256}\n`);
      parts.push(`word_count: 0\n`);
      if (repoGit.enabled) pushGitFrontMatter(parts, gitFile);
      parts.push('---\n\n');
      parts.push(`> [READ_ERROR] ${err.message}\n`);
      parts.push(`\n<!-- FILE_END id:${id} -->\n`);
      index.push({
        id, path: rel, title: path.basename(f), wordCount: 0,
        lastModified: meta.lastModified, sha256: meta.sha256,
        headings: [], outlinks: [],
        git: repoGit.enabled ? gitFile : undefined
      });
      continue;
    }

    if (stripToc) content = stripTocSections(content);

    const outlinks = collectOutlinks(content, rel);

    if (!flags.noRewrite) content = rewriteMarkdownLinks(content, rel, id, idMap, includeExts);

    if (assetMode === 'none') content = replaceBinaryImagesWithMarkers(content, rel, startDir, includeImgExts);

    content = await embedTextDiagrams(content, rel, startDir, { embedSvg, embedDrawio });

    const { content: withAnchors, headings } = addHeadingAnchorsAndCollect(content, id);

    const meta = await computeMeta(f, withAnchors);

    const gitFile = repoGit.enabled ? getGitFileInfo(startDir, rel) : { tracked: false };

    const doChunk = !!flags.chunk;
    const maxChars = Number.isFinite(flags.maxChars) ? flags.maxChars : 20000;
    let segments = [withAnchors];
    if (doChunk && withAnchors.length > maxChars) {
      const sections = withAnchors.split(/\n(?=##\s)/);
      segments = []; let cur = '';
      for (let i = 0; i < sections.length; i++) {
        const part = (i === 0) ? sections[i] : '\n' + sections[i];
        if ((cur + part).length > maxChars && cur) { segments.push(cur); cur = part; }
        else { cur += part; }
      }
      if (cur) segments.push(cur);
    }

    for (let i = 0; i < segments.length; i++) {
      const segNo = i + 1;
      const segId = segments.length > 1 ? `${id}--seg-${segNo}` : id;
      const seg = segments[i];
      const segWC = (seg.match(/\S+/g) || []).length;

      parts.push(`\n\n---\n\n`);
      parts.push(`<!-- FILE_START id:${segId} path:${rel} -->\n`);
      parts.push('---\n');
      parts.push(`source_path: ${rel}\n`);
      parts.push(`title: ${meta.title}\n`);
      parts.push(`last_modified: ${meta.lastModified}\n`);
      parts.push(`sha256: ${meta.sha256}\n`);
      parts.push(`word_count: ${segWC}\n`);
      if (segments.length > 1) parts.push(`segment: ${segNo}/${segments.length}\n`);
      if (repoGit.enabled) pushGitFrontMatter(parts, gitFile);
      parts.push('---\n\n');
      parts.push(seg.trimEnd());
      parts.push(`\n\n<!-- FILE_END id:${segId} -->\n`);

      index.push({
        id: segId, path: rel, title: meta.title, wordCount: segWC,
        lastModified: meta.lastModified, sha256: meta.sha256,
        ...(segments.length > 1 ? { segment: segNo, segments: segments.length } : {}),
        headings, outlinks,
        git: repoGit.enabled ? gitFile : undefined
      });

      const chunkObj = {
        id: segId,
        path: rel,
        title: meta.title,
        text: seg,
        tokens_estimate: tokensEstimate(seg)
      };
      if (repoGit.enabled) {
        chunkObj.repo = {
          origin: repoGit.origin, branch: repoGit.branch,
          head_sha: repoGit.head_sha, dirty: repoGit.dirty
        };
        chunkObj.git = gitFile;
      }
      chunksOut.push(chunkObj);
    }
  }

  await ensureDir(outDir);
  await fs.writeFile(outFile, parts.join(''), 'utf8');
  await fs.writeFile(
    outIndexFile,
    JSON.stringify({ generated: now, startDir, mode, git: repoGit.enabled ? repoGit : undefined, files: index }, null, 2),
    'utf8'
  );
  await fs.writeFile(outChunksFile, chunksOut.map(o => JSON.stringify(o)).join('\n'), 'utf8');

  console.log(`✅ Merged ${files.length} file(s) into ${outFile}`);
  console.log(`📇 Index written: ${outIndexFile}`);
  console.log(`🧩 Chunks written: ${outChunksFile} (${chunksOut.length} lines)`);
  if (repoGit.enabled) {
    console.log(`🔗 Repo: ${repoGit.origin || repoGit.root} @ ${repoGit.branch || 'DETACHED'} ${repoGit.dirty ? '(dirty)' : ''}`);
  } else if (!flags.noGit) {
    console.log('ℹ️ No Git repository detected — skipping Git metadata.');
  }
}

// Kick off
main().catch(err => { console.error('❌ Merge failed:', err); process.exit(1); });
