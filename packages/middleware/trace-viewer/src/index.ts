import type { Ctx, Middleware } from '@sisu-ai/core';
import { createTracingLogger } from '@sisu-ai/core';

export type TraceStyle = 'light' | 'dark';

export interface TraceMeta {
  start: string;
  end: string;
  durationMs: number;
  status: 'success' | 'error';
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUSD?: number;
    imageTokens?: number;
    imageCount?: number;
  };
}

export interface TraceDoc {
  input?: string;
  final?: string | null;
  messages: any[];
  events: any[];
  meta: TraceMeta;
}

export interface TraceViewerOptions {
  enable?: boolean;
  path?: string;       // target path; if .html, only HTML; if .json, writes both .json and .html
  html?: boolean;      // write HTML (default true)
  json?: boolean;      // write JSON (default true)
  style?: TraceStyle;  // 'light' | 'dark'
  template?: (doc: TraceDoc, style: TraceStyle) => string; // custom HTML renderer
  dir?: string;        // when no explicit path is provided, write to this directory (default 'traces')
}

export function traceViewer(opts: TraceViewerOptions = {}): Middleware {
  return async (ctx: Ctx, next) => {
    const argv = process.argv.slice(2);
    const argFlag = argv.find(a => a === '--trace' || a.startsWith('--trace='));
    const envFlag = process.env.TRACE_JSON === '1' || process.env.TRACE_HTML === '1';
    const enabled = opts.enable ?? Boolean(argFlag || envFlag);
    if (!enabled) return next();

    // Stamp messages with timestamps so the viewer can compute per-message durations
    const stamp = (m: any) => { if (m && !m.ts) (m as any).ts = new Date().toISOString(); };
    (ctx.messages || []).forEach(stamp);
    const arr = ctx.messages as any[];
    if (arr && typeof (arr as any).push === 'function') {
      const origPush = arr.push.bind(arr);
      (arr as any).push = (...args: any[]) => { args.forEach(stamp); return origPush(...args); };
    }

    const traceArgPath = argFlag && argFlag.includes('=') ? argFlag.split('=')[1] : '';
    const explicitPath = Boolean(opts.path || traceArgPath);
    const defaultDir = opts.dir || 'traces';
    const path = opts.path || traceArgPath || 'trace.json';
    // Defaults: write both HTML and JSON (back-compat with tests and prior behavior)
    const wantHtmlDefault = true;
    const wantJsonDefault = true;
    const wantHtml = opts.html ?? wantHtmlDefault;
    const wantJson = opts.json ?? wantJsonDefault;
    const cliStyle = argv.find(a => a.startsWith('--trace-style='))?.split('=')[1] as TraceStyle | undefined;
    const envStyle = (process.env.TRACE_STYLE as TraceStyle | undefined);
    const style: TraceStyle = (opts.style || cliStyle || envStyle || 'light');

    // Wrap logger with tracer
    const { logger, getTrace } = createTracingLogger(ctx.log);
    ctx.log = logger;

    const start = Date.now();
    let status: 'success' | 'error' = 'success';
    try {
      await next();
    } catch (err) {
      status = 'error';
      throw err;
    } finally {
      const end = Date.now();
      const final = ctx.messages.filter(m => m.role === 'assistant').pop();
      const out: TraceDoc = {
        input: ctx.input,
        final: final?.content ?? null,
        messages: ctx.messages,
        events: getTrace(),
        meta: {
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          durationMs: end - start,
          status,
          model: ctx.model?.name,
          usage: (ctx.state as any)?.usage,
        },
      };

      // Fallback: if usage not populated yet (e.g., usageTracker runs outside/after us),
      // derive simple totals from logged usage events.
      if (!out.meta.usage) {
        const totals = { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUSD: 0, imageTokens: 0, imageCount: 0 } as any;
        for (const ev of out.events || []) {
          const a0 = (ev?.args ?? [])[0];
          const a1 = (ev?.args ?? [])[1];
          if (typeof a0 === 'string' && a0.indexOf('[usage]') >= 0 && a1 && typeof a1 === 'object') {
            const u = a1 as any;
            if (typeof u.promptTokens === 'number') totals.promptTokens += u.promptTokens;
            if (typeof u.completionTokens === 'number') totals.completionTokens += u.completionTokens;
            if (typeof u.totalTokens === 'number') totals.totalTokens += u.totalTokens;
            if (typeof u.estCostUSD === 'number') totals.costUSD += u.estCostUSD;
            if (typeof u.imageTokens === 'number') totals.imageTokens += u.imageTokens;
            if (typeof u.imageCount === 'number') totals.imageCount += u.imageCount;
          }
        }
        // Only set if we actually observed usage
        const seen = totals.promptTokens > 0 || totals.completionTokens > 0 || totals.totalTokens > 0;
        if (seen) {
          if (!(totals.imageTokens > 0)) delete totals.imageTokens;
          if (!(totals.imageCount > 0)) delete totals.imageCount;
          out.meta.usage = totals;
        }
      }

      const fs = await import('node:fs');
      const pathMod = await import('node:path');
      const logo = findLogoDataUrl(fs, pathMod, process.cwd());
      const html = (typeof opts.template === 'function') ? opts.template(out, style) : renderTraceHtml(out, style, logo);

      // Choose output location. If no explicit path, write to traces/<ts>.{json,html}
      let targetPath = path;
      let tracesDir = pathMod.dirname(path);
      if (!explicitPath) {
        tracesDir = defaultDir;
        ensureDir(fs, tracesDir);
        targetPath = pathMod.join(tracesDir, `run-${timestamp()}.json`);
      } else if (targetPath.includes(pathMod.sep)) {
        ensureDir(fs, pathMod.dirname(targetPath));
      }

      const lower = targetPath.toLowerCase();
      const toHtmlPath = (p: string) => p.replace(/\.json$/i, '.html');
      const toJsonPath = (p: string) => p.replace(/\.html$/i, '.json');
      if (lower.endsWith('.json')) {
        // Write JSON (if enabled) and always pair an HTML next to it
        if (wantJson) { fs.writeFileSync(targetPath, JSON.stringify(out, null, 2), 'utf8'); }
        fs.writeFileSync(toHtmlPath(targetPath), html, 'utf8');
      } else if (lower.endsWith('.html')) {
        // Write HTML (if enabled) and JSON alongside if requested
        if (wantHtml) { fs.writeFileSync(targetPath, html, 'utf8'); }
        if (wantJson) fs.writeFileSync(toJsonPath(targetPath), JSON.stringify(out, null, 2), 'utf8');
      } else {
        // No extension: write JSON to the path and HTML as path + '.html'
        if (wantJson) { fs.writeFileSync(targetPath, JSON.stringify(out, null, 2), 'utf8'); }
        if (wantHtml) { fs.writeFileSync(targetPath + '.html', html, 'utf8'); }
      }

      // Write per-run JS used by SPA viewer (run-*.js) only when HTML viewer is enabled
      if (wantHtml) {
        const id = (lower.endsWith('.json') || lower.endsWith('.html'))
          ? pathMod.basename(targetPath).replace(/\.(json|html)$/i, '')
          : `run-${timestamp(new Date(out.meta.start))}`;
        // Normalize events for SPA: ensure `time` is present for timestamps
        const normalizedEvents = (out.events || []).map((e: any) => ({
          time: (e && (e.time || e.ts)) || '',
          level: e?.level || '',
          args: (typeof e?.args !== 'undefined') ? e.args : (e?.message ?? e)
        }));

        const runObj: any = {
          id,
          file: id + '.json',
          title: (out.input ? String(out.input).slice(0, 80) : id),
          time: out.meta.start || '',
          status: (out.meta.status === 'error') ? 'failed' : out.meta.status,
          duration: out.meta.durationMs || 0,
          model: out.meta.model || 'unknown',
          input: out.input || '',
          final: out.final || '',
          start: out.meta.start || '',
          end: out.meta.end || '',
          progress: out.final ? 100 : 0,
          messages: out.messages || [],
          events: normalizedEvents,
        };
        if ((out.meta as any).usage) (runObj as any).usage = (out.meta as any).usage;
        const jsName = id + '.js';
        const code = 'window.SISU_TRACES = window.SISU_TRACES || { runs: [], logo: "" };\n'
          + 'window.SISU_TRACES.runs.push(' + JSON.stringify(runObj).replace(/<\/script/g, '<\\/script') + ');\n';
        const dirForJs = explicitPath ? pathMod.dirname(targetPath) : tracesDir;
        fs.writeFileSync(pathMod.join(dirForJs, jsName), code, 'utf8');
      }

      // If writing into a traces dir, maintain SPA index and assets only when HTML viewer is enabled
      if (wantHtml) {
        const dir = explicitPath ? pathMod.dirname(targetPath) : tracesDir;
        writeIndexAssets(fs, pathMod, dir, style);
      }
    }
  };
}

function ensureDir(fs: any, dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestamp(d = new Date()) {
  const pad = (n: number, s = 2) => String(n).padStart(s, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function writeIndexAssets(fs: any, pathMod: any, dir: string, _style: TraceStyle) {
  // Build lightweight runs index so the viewer can lazy-load details on demand.
  // Prefer .js to avoid CORS (script loading); fall back to parsing minimal info from .json.
  const files: string[] = fs.readdirSync(dir);
  const jsons = new Set(files.filter((f: string) => f.endsWith('.json')));
  const jss = new Set(files.filter((f: string) => f.endsWith('.js') && f !== 'runs.js' && f !== 'viewer.js'));

  const pickFileForId = (id: string) => {
    const jsonName = id + '.json';
    const jsName = id + '.js';
    // Prefer JS to avoid CORS (script loading)
    if (jss.has(jsName)) return jsName;
    if (jsons.has(jsonName)) return jsonName;
    // Fallback to any json starting with id or any js, if weird names
    const findInSet = (set: Set<string>, pred: (s: string) => boolean) => { for (const f of set) { if (pred(f)) return f; } return undefined as any; };
    const anyJson = findInSet(jsons, f => f.replace(/\.json$/i, '') === id) || findInSet(jsons, f => f.includes(id));
    const anyJs = findInSet(jss, f => f.replace(/\.js$/i, '') === id) || findInSet(jss, f => f.includes(id));
    return anyJs || anyJson || '';
  };

  const ids = new Set<string>();
  // derive ids from jsons and jss
  for (const f of jsons) ids.add(f.replace(/\.json$/i, ''));
  for (const f of jss) ids.add(f.replace(/\.js$/i, ''));

  const parseRunJs = (code: string): any | null => {
    // Expect: window.SISU_TRACES.runs.push(<json>);
    const m = code.match(/runs\.push\(([\s\S]*?)\);/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  };

  const toSummary = (id: string) => {
    const file = pickFileForId(id);
    let title = id;
    let time = '';
    let status: any = 'unknown';
    let duration = 0;
    if (file.endsWith('.json')) {
      try {
        const obj = JSON.parse(fs.readFileSync(pathMod.join(dir, file), 'utf8'));
        title = obj && obj.input ? String(obj.input).slice(0, 120) : id;
        time = obj && obj.meta && obj.meta.start || '';
        status = obj && obj.meta && obj.meta.status || 'unknown';
        duration = obj && obj.meta && obj.meta.durationMs || 0;
      } catch {
        // Skip malformed JSON entries to avoid breaking runs index
        return null as any;
      }
    } else if (file.endsWith('.js')) {
      try {
        const code = fs.readFileSync(pathMod.join(dir, file), 'utf8');
        const obj = parseRunJs(code);
        if (obj) {
          title = obj.title || (obj.input ? String(obj.input).slice(0, 120) : id);
          time = obj.time || obj.start || '';
          status = obj.status || 'unknown';
          duration = obj.duration || 0;
        }
      } catch {}
    }
    return { id, file, title, time, status, duration };
  };

  const index = Array.from(ids).map(toSummary).filter((x: any) => x && x.file);
  // Sort newest first based on time
  index.sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());

  const runsJs = 'window.SISU_RUN_INDEX = ' + JSON.stringify(index) + ';\n';
  fs.writeFileSync(pathMod.join(dir, 'runs.js'), runsJs, 'utf8');

  // Copy SPA viewer assets (viewer.html/css/js) into target dir
  let assetsDir = '';
  // ESM-friendly resolution using import.meta.url; falls back to __dirname if available
  const modUrl = (import.meta && import.meta.url) ? import.meta.url : '';
  const here = modUrl ? pathMod.dirname(new URL(modUrl).pathname) : (typeof __dirname !== 'undefined' ? __dirname : '');
  if (here) assetsDir = pathMod.resolve(here, '..', 'assets');
  if (!assetsDir || !fs.existsSync(pathMod.join(assetsDir, 'viewer.html'))) {
    assetsDir = pathMod.resolve(__dirname as any, '..', 'assets');
  }
  if (!assetsDir || !fs.existsSync(pathMod.join(assetsDir, 'viewer.html'))) {
    // Last-resort guess for monorepo execution from example cwd
    const guess = pathMod.resolve(process.cwd(), '..', '..', 'packages', 'middleware', 'trace-viewer', 'assets');
    if (fs.existsSync(pathMod.join(guess, 'viewer.html'))) assetsDir = guess;
  }
  if (assetsDir) {
    fs.writeFileSync(pathMod.join(dir, 'viewer.html'), fs.readFileSync(pathMod.join(assetsDir, 'viewer.html'), 'utf8'), 'utf8');
    fs.writeFileSync(pathMod.join(dir, 'viewer.css'), fs.readFileSync(pathMod.join(assetsDir, 'viewer.css'), 'utf8'), 'utf8');
    fs.writeFileSync(pathMod.join(dir, 'viewer.js'), fs.readFileSync(pathMod.join(assetsDir, 'viewer.js'), 'utf8'), 'utf8');
  }

}

// Minimal HTML renderer used for side-by-side .html files next to JSON
function renderTraceHtml(out: TraceDoc, _style: TraceStyle = 'light', _logoDataUrl = ''): string {
  const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const messages = (out.messages || []).map((m: any) => `<tr><td>${esc(m.role || '')}</td><td><pre>${esc(typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2))}</pre></td></tr>`).join('\n');
  const events = (out.events || []).map((e: any) => `<tr><td>${esc(e.ts || e.time || '')}</td><td>${esc(e.level || '')}</td><td><pre>${esc(JSON.stringify(e.args, null, 2))}</pre></td></tr>`).join('\n');
  const usage = (out.meta as any).usage || {};
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Trace</title>
    <style>body{font-family:system-ui,Arial,sans-serif;margin:16px;color:#111} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:6px;vertical-align:top} th{background:#f6f6f6} pre{white-space:pre-wrap}</style>
  </head><body>
    <h1>Trace</h1>
    <div><b>Status:</b> ${esc(out.meta.status)} • <b>Model:</b> ${esc(out.meta.model || '')} • <b>Duration:</b> ${(out.meta.durationMs / 1000).toFixed(2)}s</div>
    <div><b>Start:</b> ${esc(out.meta.start)} • <b>End:</b> ${esc(out.meta.end)}</div>
    ${usage && (usage.promptTokens || usage.totalTokens) ? `<div><b>Usage:</b> prompt=${usage.promptTokens ?? 0}, completion=${usage.completionTokens ?? 0}, total=${usage.totalTokens ?? 0}${usage.costUSD != null ? `, cost=$${usage.costUSD}` : ''}</div>` : ''}
    <h2>Input</h2><pre>${esc(String(out.input || ''))}</pre>
    <h2>Final</h2><pre>${esc(String(out.final || ''))}</pre>
    <h2>Messages</h2><table><thead><tr><th>role</th><th>content</th></tr></thead><tbody>${messages}</tbody></table>
    <h2>Events</h2><table><thead><tr><th>time</th><th>level</th><th>args</th></tr></thead><tbody>${events}</tbody></table>
  </body></html>`;
}

function findLogoDataUrl(_fs: any, _pathMod: any, _startDir: string): string { return ''; }
