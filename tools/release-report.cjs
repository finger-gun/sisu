#!/usr/bin/env node
/*
 Prints a release report for all workspace packages:
 - local vs published version
 - commit changes since a base (npm publish time or --since ref)
 - heuristic bump suggestion (major/minor/patch)

 Usage:
   node tools/release-report.cjs [--since=origin/main] [--json]
*/
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function sh(cmd, opts = {}) {
  try { return cp.execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts }).trim(); }
  catch (e) { return ''; }
}

function findPackages(root) {
  const pkgs = [];
  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (fs.existsSync(path.join(p, 'package.json'))) {
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'));
            if (pkg && pkg.name) pkgs.push({ dir: p, name: pkg.name, version: pkg.version || '0.0.0' });
          } catch {}
        } else {
          // dive only 2 levels deep under packages/*
          if (!/node_modules/.test(p)) scan(p);
        }
      }
    }
  }
  const ws = ['packages'];
  for (const w of ws) {
    const wd = path.join(root, w);
    if (fs.existsSync(wd)) scan(wd);
  }
  return pkgs;
}

function npmView(name, field) {
  const out = sh(`npm view ${name} ${field} --json`);
  if (!out) return undefined;
  try { return JSON.parse(out); } catch { return out; }
}

function commitsSince(dir, sinceIso) {
  const rangeArg = sinceIso ? `--since='${sinceIso}'` : '';
  const out = sh(`git log ${rangeArg} --pretty=%H -- ${dir}`);
  const lines = out ? out.split(/\r?\n/).filter(Boolean) : [];
  return lines;
}

function changedFilesSince(dir, sinceRef) {
  const out = sh(`git diff --name-only ${sinceRef}...HEAD -- ${dir}`);
  const lines = out ? out.split(/\r?\n/).filter(Boolean) : [];
  return lines;
}

function commitMessages(dir, sinceIso) {
  const rangeArg = sinceIso ? `--since='${sinceIso}'` : '';
  const out = sh(`git log ${rangeArg} --pretty=%s%n%b -- ${dir}`);
  return out || '';
}

function suggestBump(msgs) {
  const m = msgs.toLowerCase();
  if (/breaking change|breaks|major!|!:/.test(m)) return 'major';
  if (/(feat|feature|add|introduce)/.test(m)) return 'minor';
  return 'patch';
}

(async function main() {
  const args = process.argv.slice(2);
  const sinceRef = (args.find(a => a.startsWith('--since=')) || '').split('=')[1] || '';
  const wantJson = args.includes('--json');
  const root = process.cwd();
  const pkgs = findPackages(root);
  const rows = [];
  for (const p of pkgs) {
    const publishedVersion = npmView(p.name, 'version');
    let sinceIso = '';
    let changed = [];
    let messages = '';
    if (sinceRef) {
      changed = changedFilesSince(p.dir, sinceRef);
      if (changed.length) {
        messages = sh(`git log ${sinceRef}...HEAD --pretty=%s%n%b -- ${p.dir}`);
      }
    } else if (publishedVersion && typeof publishedVersion === 'string') {
      const timeMap = npmView(p.name, 'time') || {};
      const pubTime = timeMap[publishedVersion];
      if (pubTime) {
        sinceIso = new Date(pubTime).toISOString();
        changed = commitsSince(p.dir, sinceIso);
        if (changed.length) messages = commitMessages(p.dir, sinceIso);
      }
    }
    const needsRelease = changed.length > 0;
    const bump = needsRelease ? suggestBump(messages) : '';
    rows.push({ name: p.name, dir: path.relative(root, p.dir), local: p.version, published: publishedVersion || 'NA', changed: needsRelease ? changed.length : 0, bump, sample: messages.split(/\n/).find(Boolean) || '' });
  }
  if (wantJson) {
    console.log(JSON.stringify({ packages: rows }, null, 2));
    return;
  }
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('package', 40), pad('local', 10), pad('published', 10), pad('changes', 8), 'suggest', 'sample');
  for (const r of rows) {
    console.log(pad(r.name, 40), pad(r.local, 10), pad(r.published, 10), pad(r.changed, 8), pad(r.bump || '-', 7), r.sample);
  }
})();

