#!/usr/bin/env node
/*
 * Update root README.md with discovered Adapters, Middlewares, and Tools.
 * - Scans packages/adapters/*, packages/middleware/*, packages/tools/*
 * - Rewrites the "## Find your inner strength" section to include:
 *   - Adapters: single line with links
 *   - Middlewares: bullet list
 *   - Tools: bullet list
 * - Avoids duplicates; sorts alphabetically for stability.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const readmePath = path.join(root, 'README.md');

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function hasFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

function listSubdirs(p) {
  try { return fs.readdirSync(p).filter((d) => isDir(path.join(p, d))); }
  catch { return []; }
}

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return undefined; }
}

function titleCase(s) { return String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\s+/g, ' ').trim(); }

function collectAdapters() {
  const base = path.join(root, 'packages', 'adapters');
  const dirs = listSubdirs(base);
  const items = [];
  for (const d of dirs) {
    const rPath = path.join('packages', 'adapters', d, 'README.md');
    // Include even if README is missing, to keep the index complete
    let label = titleCase(d);
    if (d.toLowerCase() === 'openai') label = 'OpenAI';
    items.push({ label, link: rPath });
  }
  // sort by label
  items.sort((a, b) => a.label.localeCompare(b.label));
  // dedupe by label
  const seen = new Set();
  return items.filter((x) => (seen.has(x.label) ? false : (seen.add(x.label), true)));
}

function collectPackages(kind) {
  const base = path.join(root, 'packages', kind);
  const dirs = listSubdirs(base);
  const items = [];
  for (const d of dirs) {
    const pkgPath = path.join(base, d, 'package.json');
    const readmeRel = path.join('packages', kind, d, 'README.md');
    if (!hasFile(path.join(root, readmeRel))) continue;
    const pkg = readJSON(pkgPath);
    const scope = kind === 'tools' ? 'tool' : kind; // singularize tools for fallback
    const name = pkg?.name || `@sisu-ai/${scope}-${d}`;
    items.push({ name, link: readmeRel });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  // dedupe by name
  const seen = new Set();
  return items.filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true)));
}

function collectExamples() {
  const base = path.join(root, 'examples');
  const dirs = listSubdirs(base);
  const items = [];
  for (const d of dirs) {
    const readmeRel = path.join('examples', d, 'README.md');
    const link = hasFile(path.join(root, readmeRel)) ? readmeRel : path.join('examples', d);
    const name = d; // keep folder name for clarity
    items.push({ name, link });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set();
  return items.filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true)));
}

function buildAdaptersLine(adapters) {
  if (!adapters.length) return '';
  const parts = adapters.map((a) => `[${a.label}](${a.link})`).join(', ');
  return `- Adapters: ${parts}`;
}

function buildListBlock(title, items) {
  if (!items.length) return '';
  const lines = [`- ${title}:`];
  for (const it of items) lines.push(`  - [${it.name}](${it.link})`);
  return lines.join('\n');
}

function updateSection(readme) {
  const startIdx = readme.indexOf('## Find your inner strength');
  if (startIdx === -1) return readme; // nothing to do
  const rest = readme.slice(startIdx);
  const nextHead = rest.indexOf('\n## ');
  const endIdx = nextHead === -1 ? readme.length : startIdx + nextHead + 1; // include newline
  const section = readme.slice(startIdx, endIdx);

  // Collect items
  const adapters = collectAdapters();
  const mws = collectPackages('middleware');
  const tools = collectPackages('tools');
  const examples = collectExamples();

  // Remove any existing blocks we manage
  let body = section;
  body = body.replace(/\n?- Adapters:[^\n]*\n?/g, '\n');
  body = body.replace(/- Middlewares:\n(?:[ \t]*- \[.*?\]\(.*?\)\n)*/g, '');
  body = body.replace(/- Tools:\n(?:[ \t]*- \[.*?\]\(.*?\)\n)*/g, '');
  body = body.replace(/- Examples:\n(?:[ \t]*- \[.*?\]\(.*?\)\n|[ \t]*- \w.*\n)*/g, '');

  // Ensure single blank line separation within section
  body = body.replace(/\n{3,}/g, '\n\n');

  // Insert after the core link if present, otherwise after the title line
  const coreLine = body.match(/^- \[packages\/core\]\(packages\/core\/README.md\).*$/m);
  const insertAfter = coreLine ? coreLine.index + coreLine[0].length : body.indexOf('\n') + 1;

  const pre = body.slice(0, insertAfter).replace(/\s+$/,'') + '\n';
  const post = body.slice(insertAfter).replace(/^\n*/, '');

  const newBlocks = [
    buildAdaptersLine(adapters),
    buildListBlock('Middlewares', mws),
    buildListBlock('Tools', tools),
    buildListBlock('Examples', examples),
  ].filter(Boolean).join('\n');

  const updatedSection = pre + newBlocks + '\n' + post;
  return readme.slice(0, startIdx) + updatedSection + readme.slice(endIdx);
}

function main() {
  const readme = fs.readFileSync(readmePath, 'utf8');
  const out = updateSection(readme);
  if (out !== readme) {
    fs.writeFileSync(readmePath, out);
    console.error('README.md updated.');
  } else {
    console.error('README.md unchanged.');
  }
}

main();
