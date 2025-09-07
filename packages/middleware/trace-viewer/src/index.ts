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
    try {
      const stamp = (m: any) => { if (m && !m.ts) (m as any).ts = new Date().toISOString(); };
      (ctx.messages || []).forEach(stamp);
      const arr = ctx.messages as any[];
      if (arr && typeof (arr as any).push === 'function') {
        const origPush = arr.push.bind(arr);
        (arr as any).push = (...args: any[]) => { args.forEach(stamp); return origPush(...args); };
      }
    } catch { }

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
        // When a .json path is provided, always pair an .html next to it (regardless of wantHtml flag)
        if (wantJson) { fs.writeFileSync(targetPath, JSON.stringify(out, null, 2), 'utf8'); }
        const htmlPath = toHtmlPath(targetPath);
        fs.writeFileSync(htmlPath, html, 'utf8');
      } else if (lower.endsWith('.html')) {
        // Only write HTML; write JSON alongside only if explicitly requested
        if (wantHtml) { fs.writeFileSync(targetPath, html, 'utf8'); }
        if (wantJson) {
          const jsonPath = toJsonPath(targetPath);
          fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');
        }
      } else {
        // No extension provided; write JSON to target and HTML with same base name
        if (wantJson) { fs.writeFileSync(targetPath, JSON.stringify(out, null, 2), 'utf8'); }
        if (wantHtml) { fs.writeFileSync(targetPath + '.html', html, 'utf8'); }
      }

      // Write per-run JS used by SPA viewer (run-*.js) only when HTML viewer is enabled
      try {
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
      } catch {}

      // If writing into a traces dir, maintain SPA index and assets only when HTML viewer is enabled
      try {
        if (wantHtml) {
          const dir = explicitPath ? pathMod.dirname(targetPath) : tracesDir;
          writeIndexAssets(fs, pathMod, dir, style);
        }
      } catch { }
    }
  };
}

function renderTraceHtml(out: TraceDoc, style: TraceStyle = 'light', logoDataUrl = ''): string {
  const esc = (s: string) => s.replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const palette = getPalette(style);
  const css = `
  :root{--bg:${palette.bg};--fg:${palette.fg};--muted:${palette.muted};--card:${palette.card};--border:${palette.border};--accent:${palette.accent}}
  *{box-sizing:border-box}
  body{font-family:system-ui,Arial,sans-serif;margin:20px;background:
      radial-gradient(1200px 600px at -10% -20%, rgba(99,102,241,0.10), rgba(99,102,241,0) 60%),
      radial-gradient(800px 500px at 110% -10%, rgba(59,130,246,0.08), rgba(59,130,246,0) 55%),
      var(--bg);color:var(--fg)}
  @media (prefers-color-scheme: dark){
    body{background:
      radial-gradient(1200px 600px at -10% -20%, rgba(124,58,237,0.18), rgba(124,58,237,0) 60%),
      radial-gradient(800px 500px at 110% -10%, rgba(59,130,246,0.14), rgba(59,130,246,0) 55%),
      var(--bg);
    }
  }
  .brand{display:flex;align-items:center;gap:8px;margin:0 0 12px}
  .brand img{height:20px;width:auto;opacity:.9;border-radius:4px}
  h1{font-size:18px;margin:0}
  .section{margin:16px 0}
  .grid{display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:start}
  pre{background:var(--card);padding:8px;border-radius:6px;overflow:auto;border:1px solid var(--border)}
  details{margin:6px 0}
  details>summary{cursor:pointer}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid var(--border);padding:6px;font-size:12px;vertical-align:top}
  th{background:var(--card);text-align:left}
  code{font-family:ui-monospace,Consolas,monospace}
  .chip{display:inline-flex;justify-content:center;align-items:center;padding:2px 6px;border-radius:999px;color:#fff;font-size:11px;margin-right:6px;width:84px}
  .role-user{background:#2563eb}
  .role-assistant{background:#10b981}
  .role-system{background:#6b7280}
  .role-tool{background:#d97706}
  .snippet{color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .msg-summary{display:grid;grid-template-columns:96px 1fr auto;align-items:center;gap:8px}
  .badge{display:inline-block;padding:2px 6px;border-radius:999px;background:var(--accent);color:#fff;font-size:11px;margin-left:6px}
  .status-success{background:#16a34a;color:#fff}
  .status-error{background:#dc2626;color:#fff}
  .card{background:var(--card);padding:12px;border:1px solid var(--border);border-radius:8px}
  `;

  const snippet = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + '…' : s);

  const messages = (out.messages || []).map((m: any) => {
    const roleLabel = String(m.role || '').toLowerCase();
    const roleText = roleLabel ? roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1) : '';
    const snip = snippet(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
    return `
    <details class="msg${m.tool_call_id || m.tool_calls ? ' tool-call' : ''}">
      <summary class="msg-summary"><span class="chip role-${esc(roleLabel)}">${esc(roleText)}</span><span class="snippet">${esc(snip)}</span>${(m.tool_calls || m.tool_call_id) ? '<span class="badge">tools</span>' : ''}</summary>
      <pre>${esc(typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2))}</pre>
    </details>`;
  }).join('\n');

  const events = (out.events || []).map((e: any) => `
    <tr><td>${esc(e.ts || '')}</td><td><code>${esc(e.level || '')}</code></td><td><pre>${esc(JSON.stringify(e.args, null, 2))}</pre></td></tr>
  `).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Trace</title><style>${css}</style></head>
  <body>
    <div class="brand">${logoDataUrl ? `<img src="${logoDataUrl}" alt="Sisu"/>` : ''}<h1>Trace</h1></div>
    <div class="section card">
      <details><summary><b>Input</b> <span class="snippet">${esc(snippet(String(out.input || '')))}</span></summary><pre>${esc(String(out.input || ''))}</pre></details>
      <details><summary><b>Final</b> <span class="snippet">${esc(snippet(String(out.final || '')))}</span></summary><pre>${esc(String(out.final || ''))}</pre></details>
      <div class="grid" style="margin-top:8px">
        <div>model</div><code>${esc(out.meta.model || '')}</code>
        <div>status</div><span class="badge status-${out.meta.status}">${out.meta.status}</span>
        <div>duration</div><span>${(out.meta.durationMs / 1000).toFixed(2)}s</span>
        <div>start</div><span>${esc(out.meta.start)}</span>
        <div>end</div><span>${esc(out.meta.end)}</span>
      </div>
    </div>
    <div class="section">
      <h2>Messages</h2>
      ${messages}
    </div>
    <div class="section">
      <h2>Events</h2>
      <table><thead><tr><th>time</th><th>level</th><th>args</th></tr></thead><tbody>
      ${events}
      </tbody></table>
    </div>
    <script>
      (function(){
        var palettes = ${JSON.stringify({ light: getPalette('light'), dark: getPalette('dark') })};
        function apply(theme){
          var p = palettes[theme] || palettes.light;
          var st = document.getElementById('trace-theme-style');
          if (!st) { st = document.createElement('style'); st.id = 'trace-theme-style'; document.head.appendChild(st); }
          st.textContent = ":root{--bg:"+p.bg+";--fg:"+p.fg+";--muted:"+p.muted+";--card:"+p.card+";--border:"+p.border+";--accent:"+p.accent+"}";
        }
        var theme = localStorage.getItem('trace_theme') || '${style}';
        apply(theme);
        window.addEventListener('message', function(e){
          try{ var d = e.data; if (d && d.type === 'TRACE_THEME' && d.theme) { localStorage.setItem('trace_theme', d.theme); apply(d.theme); } }catch(err){}
        });
      })();
    </script>
  </body></html>`;
}

function ensureDir(fs: any, dir: string) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { }
}

function timestamp(d = new Date()) {
  const pad = (n: number, s = 2) => String(n).padStart(s, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// New: asset-based index writer that prepares only runs.js (SPA consumes run-*.js)
function writeIndexAssets(fs: any, pathMod: any, dir: string, _style: TraceStyle) {
  const logo = findLogoDataUrl(fs, pathMod, dir);
  // runs.js: build from existing run-*.js files and include logo
  const jsFiles: string[] = fs.readdirSync(dir).filter((f: string) => f.endsWith('.js') && f.startsWith('run-'));
  const runsJs = 'window.SISU_RUN_SCRIPTS = ' + JSON.stringify(jsFiles.sort().reverse()) + ';\n'
    + 'window.SISU_LOGO_DATA = ' + JSON.stringify(logo || '') + ';\n';
  fs.writeFileSync(pathMod.join(dir, 'runs.js'), runsJs, 'utf8');

  // Copy SPA viewer assets (viewer.html/css/js) into target dir
  try {
    let assetsDir = '';
    try {
      // ESM-friendly resolution using import.meta.url; falls back to __dirname if available
      // @ts-ignore
      const modUrl = (import.meta && import.meta.url) ? import.meta.url : '';
      const here = modUrl ? pathMod.dirname(new URL(modUrl).pathname) : (typeof __dirname !== 'undefined' ? __dirname : '');
      if (here) assetsDir = pathMod.resolve(here, '..', 'assets');
    } catch {}
    if (!assetsDir || !fs.existsSync(pathMod.join(assetsDir, 'viewer.html'))) {
      try { assetsDir = pathMod.resolve(__dirname as any, '..', 'assets'); } catch {}
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
  } catch {}
}

function writeIndex(fs: any, pathMod: any, dir: string, style: TraceStyle) {
  const esc = (s: string) => String(s).replace(/[&<>]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const logo = findLogoDataUrl(fs, pathMod, dir);

  // Collect runs from JSON files
  const jsonFiles: string[] = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json') && f.startsWith('run-'));
  const runs = jsonFiles.map(f => {
    const p = pathMod.join(dir, f);
    let doc: any = {};
    try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { }
    const meta = doc.meta || {};
    const input = doc.input || '';
    const final = (doc.final == null) ? '' : String(doc.final);
    const title = input ? (String(input).slice(0, 80)) : f.replace(/\.json$/, '');
    const status = (meta.status === 'error') ? 'failed' : (meta.status || 'success');
    const duration = Number(meta.durationMs || 0);
    const messages = Array.isArray(doc.messages) ? doc.messages : [];
    const events = Array.isArray(doc.events) ? doc.events.map((e: any) => ({ time: e.ts || e.time || '', level: e.level || '', args: (typeof e.args !== 'undefined' ? e.args : (e.message ?? e)) })) : [];
    const progress = (final && status === 'success') ? 100 : 0;
    return {
      id: f.replace(/\.json$/, ''),
      file: f,
      title,
      time: meta.start || '',
      status,
      duration,
      model: meta.model || 'unknown',
      input,
      final,
      start: meta.start || '',
      end: meta.end || '',
      progress,
      messages,
      events,
    };
  }).sort((a, b) => String(b.time).localeCompare(String(a.time)));

  // Build the unified viewer HTML (based on provided design)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sisu Trace Visualizer</title>
  <style>
    :root{ --bg:#0b0b10; --panel:rgba(255,255,255,.06); --panel-strong:rgba(255,255,255,.12); --text:#e8e8ef; --muted:#a5a6b5; --brand:#6d6af7; --brand-2:#9b5cf6; --surface-blur:12px; --radius-xl:16px; --shadow-1:0 6px 30px rgba(0,0,0,.35); --code:#0f1220; --code-text:#e5e7ff; --code-key:#a78bfa; --code-str:#6ee7b7; --code-num:#93c5fd; --code-comm:#8b8b9c; }
    [data-theme="light"]{ --bg:#f6f7fb; --panel:rgba(255,255,255,.95); --panel-strong:#ffffff; --text:#0e1222; --muted:#4b5563; --code:#f3f5fb; --code-text:#0e1222; --code-key:#4338ca; --code-str:#047857; --code-num:#1d4ed8; --code-comm:#6b7280; --shadow-1:0 8px 30px rgba(10,14,35,.06); }
    body{ margin:0; color:var(--text); font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; background:radial-gradient(1200px 600px at 10% -10%, rgba(109,106,247,.25), transparent 60%), radial-gradient(1200px 800px at 120% 20%, rgba(155,92,246,.20), transparent 60%), var(--bg); min-height:100vh; }
    .topbar{ position:sticky; top:0; z-index:10; display:flex; gap:12px; align-items:center; justify-content:space-between; padding:14px 20px; backdrop-filter:saturate(160%) blur(var(--surface-blur)); background:linear-gradient(180deg, rgba(12,12,20,.65), rgba(12,12,20,.25)); border-bottom:1px solid rgba(255,255,255,.07); }
    [data-theme="light"] .topbar{ background:linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.85)); border-bottom:1px solid rgba(0,0,0,.06); }
    .brand{ display:flex; align-items:center; gap:10px; }
    .brand h1{ font-size:16px; margin:0; font-weight:700; letter-spacing:.3px; }
    .brand-img{ width:120px; height:28px; display:block; object-fit:contain; }
    .brand-fallback{ width:28px; height:28px; border-radius:6px; background:conic-gradient(from 120deg, var(--brand), var(--brand-2)); box-shadow: inset 0 0 18px rgba(255,255,255,.25), 0 4px 18px rgba(109,106,247,.45); }
    .toolbar{ display:flex; gap:8px; align-items:center; }
    .btn{ border:1px solid rgba(255,255,255,.1); background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)); color:var(--text); padding:8px 12px; border-radius:12px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; transition:all .18s ease; box-shadow:var(--shadow-1); }
    [data-theme="light"] .btn{ border-color:rgba(0,0,0,.1); background:linear-gradient(180deg,#fff,#f3f4f6); }
    .btn:hover{ transform:translateY(-1px); }
    .btn.primary{ background:linear-gradient(135deg,var(--brand),var(--brand-2)); border:none; color:#fff; }
    .seg{ display:flex; background:var(--panel); border:1px solid rgba(255,255,255,.1); border-radius:12px; overflow:hidden; }
    [data-theme="light"] .seg{ border-color:rgba(0,0,0,.06); }
    .seg button{ background:transparent; border:0; color:var(--muted); padding:8px 12px; cursor:pointer; }
    .seg button.active{ color:var(--text); background:linear-gradient(135deg, rgba(109,106,247,.25), rgba(155,92,246,.2)); }
    .app{ display:grid; grid-template-columns:320px 1fr; gap:16px; padding:16px; }
    @media(max-width:1100px){ .app{ grid-template-columns:1fr; } }
    .sidebar{ backdrop-filter: blur(var(--surface-blur)); background: var(--panel); border: 1px solid rgba(255,255,255,.08); border-radius: var(--radius-xl); box-shadow: var(--shadow-1); overflow:hidden; }
    [data-theme="light"] .sidebar{ border-color:rgba(0,0,0,.06); }
    .sidebar .head{ display:flex; align-items:center; justify-content:space-between; padding:14px 14px 8px; border-bottom:1px solid rgba(255,255,255,.06); }
    [data-theme="light"] .sidebar .head{ border-bottom-color:rgba(0,0,0,.06); }
    .sidebar .search{ padding:10px 12px 16px; }
    .input{ position:relative; }
    .input input{ width:100%; padding:10px 12px 10px 34px; border-radius:10px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.06); color:var(--text); outline:none; }
    [data-theme="light"] .input input{ background:#fff; border-color:rgba(0,0,0,.08); }
    .input svg{ position:absolute; left:10px; top:9px; opacity:.7 }
    .run-list{ max-height: calc(100vh - 220px); overflow:auto; padding:8px; }
    .run{ padding:10px 10px; margin:6px 4px; border-radius:12px; background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.07); cursor:pointer; transition: transform .16s ease, background .2s ease; }
    [data-theme="light"] .run{ background:linear-gradient(180deg, rgba(0,0,0,.03), rgba(0,0,0,.015)); border-color:rgba(0,0,0,.06); }
    .run:hover{ transform:translateY(-1px); }
    .run.active{ outline:2px solid rgba(109,106,247,.55); background:linear-gradient(135deg, rgba(109,106,247,.18), rgba(155,92,246,.12)); }
    [data-theme="light"] .run.active{ outline-color:rgba(109,106,247,.45); background:linear-gradient(135deg, rgba(109,106,247,.12), rgba(155,92,246,.10)); }
    .run .title{ font-weight:600; font-size:13px; margin-bottom:4px; }
    .run .meta{ display:flex; gap:10px; color:var(--muted); font-size:12px; align-items:center; }
    .status{ padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; letter-spacing:.3px; text-transform:uppercase; }
    .status.success{ background:rgba(54,211,153,.15); color:#66f1c0; }
    .status.failed{ background:rgba(251,113,133,.12); color:#ff9fb0; }
    .main{ display:flex; flex-direction:column; gap:16px; }
    .panel{ background:var(--panel); border:1px solid rgba(255,255,255,.08); border-radius:var(--radius-xl); box-shadow:var(--shadow-1); overflow:hidden; }
    [data-theme="light"] .panel{ border-color:rgba(0,0,0,.06); }
    .trace-header{ padding:16px; border-bottom:1px solid rgba(255,255,255,.06); display:grid; grid-template-columns:1fr; gap:10px; align-items:center; }
    @media(min-width:900px){ .trace-header{ grid-template-columns:1fr auto; } }
    [data-theme="light"] .trace-header{ border-bottom-color:rgba(0,0,0,.06); }
    .titlebar{ display:flex; gap:12px; align-items:center; }
    .chip{ font-weight:600; font-size:12px; color:var(--muted); border:1px solid rgba(255,255,255,.08); padding:6px 10px; border-radius:999px; backdrop-filter: blur(6px); background:rgba(255,255,255,.06); }
    [data-theme="light"] .chip{ border-color:rgba(0,0,0,.08); background:rgba(255,255,255,.85); }
    .metrics{ display:flex; gap:16px; flex-wrap:wrap; }
    .metric{ background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.06); padding:10px 12px; border-radius:12px; min-width:130px; }
    [data-theme="light"] .metric{ background:linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.85)); border-color:rgba(0,0,0,.06); }
    .metric b{ display:block; font-size:12px; color:var(--muted); font-weight:600; }
    .metric span{ font-size:16px; font-weight:700; }
    .progress{ height:10px; background:rgba(255,255,255,.08); border-radius:999px; overflow:hidden; position:relative; }
    [data-theme="light"] .progress{ background:rgba(0,0,0,.08); }
    .progress > i{ display:block; height:100%; width:0%; background:linear-gradient(90deg,var(--brand),var(--brand-2)); box-shadow:0 0 12px rgba(109,106,247,.5) inset; }
    .accordion{ border-top:1px solid rgba(255,255,255,.06); }
    [data-theme="light"] .accordion{ border-top-color:rgba(0,0,0,.06); }
    .acc{ border-bottom:1px solid rgba(255,255,255,.06); }
    [data-theme="light"] .acc{ border-bottom-color:rgba(0,0,0,.06); }
    .acc > button{ width:100%; background:transparent; display:flex; align-items:center; justify-content:space-between; padding:14px 16px; color:var(--text); border:0; font-weight:700; letter-spacing:.2px; cursor:pointer; }
    .acc > button:hover{ background:rgba(255,255,255,.05); }
    [data-theme="light"] .acc>button:hover{ background:rgba(0,0,0,.03); }
    .acc .content{ padding:0 16px 16px; display:none; }
    .acc.open .content{ display:block; animation:drop .18s ease; }
    @keyframes drop{ from{ opacity:0; transform:translateY(-6px);} to{ opacity:1; transform:none; } }
    .tags{ display:flex; gap:8px; flex-wrap:wrap; margin:0 16px 12px; }
    .tag{ padding:6px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.1); color:var(--muted); cursor:pointer; user-select:none; }
    [data-theme="light"] .tag{ border-color:rgba(0,0,0,.1); }
    .tag.active{ background:linear-gradient(135deg, rgba(109,106,247,.25), rgba(155,92,246,.2)); color:var(--text); }
    .msg-list{ padding:0 16px 12px; max-height:48vh; overflow:auto; }
    .msg{ border:1px solid rgba(255,255,255,.08); background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03)); border-radius:12px; padding:10px; margin:10px 0; }
    [data-theme="light"] .msg{ border-color:rgba(0,0,0,.08); background:linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.85)); }
    .msg .head{ display:flex; align-items:center; gap:10px; justify-content:space-between; }
    .role{ font-weight:700; font-size:12px; padding:5px 8px; border-radius:8px; background: rgba(96,165,250,.14); color:#bcd6ff; }
    .role.user{ background: rgba(155,92,246,.18); color:#5b21b6; }
    .role.system{ background: rgba(148,163,184,.22); color:#334155; }
    .role.tool{ background: rgba(54,211,153,.18); color:#047857; }
    .msg pre{ background:var(--code); color:var(--code-text); border-radius:10px; padding:10px; overflow:auto; border:1px solid rgba(255,255,255,.08); }
    [data-theme="light"] .msg pre{ border-color:rgba(0,0,0,.06); }
    .json-key{ color:var(--code-key); }
    .json-str{ color:var(--code-str); }
    .json-num{ color:var(--code-num); }
    .json-comm{ color:var(--code-comm); }
    .events{ padding:0 16px 16px; }
    .events pre{ background:var(--code); color:var(--code-text); border-radius:10px; padding:10px; overflow:auto; border:1px solid rgba(255,255,255,.08); }
    [data-theme="light"] .events pre{ border-color:rgba(0,0,0,.06); }
    table{ width:100%; border-collapse:collapse; }
    th,td{ text-align:left; padding:10px; border-bottom:1px dashed rgba(255,255,255,.08); }
    [data-theme="light"] th,[data-theme="light"] td{ border-bottom-color:rgba(0,0,0,.08); }
    th{ position:sticky; top:0; backdrop-filter:blur(8px); background:rgba(12,12,20,.55); }
    [data-theme="light"] th{ background:rgba(255,255,255,.95); }
    .footer{ padding:12px 16px; display:flex; justify-content:space-between; color:var(--muted); font-size:12px; }
    .hidden{ display:none !important; }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <img class="brand-img" id="brandImg" src="${logo || 'sisu-logo.jpg'}" alt="Sisu logo" onerror="this.classList.add('hidden'); document.getElementById('brandFallback').classList.remove('hidden');">
      <div id="brandFallback" class="brand-fallback hidden" aria-hidden="true"></div>
      <h1>Sisu Trace Visualizer</h1>
      <span class="chip" id="betaChip">beta</span>
    </div>
    <div class="toolbar">
      <div class="seg" role="tablist" aria-label="Theme">
        <button id="lightBtn" role="tab">Light</button>
        <button id="darkBtn" class="active" role="tab">Dark</button>
      </div>
      <button class="btn" id="exportJson">Export JSON</button>
      <button class="btn primary" id="refreshBtn">Refresh</button>
    </div>
  </header>

  <main class="app">
    <aside class="sidebar" aria-label="Runs">
      <div class="head">
        <strong style="letter-spacing:.3px">Traces</strong>
        <span class="chip" id="runsCount">0 runs</span>
      </div>
      <div class="search">
        <div class="input">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="2"/></svg>
          <input id="runSearch" placeholder="Search traces, e.g. s3 list...">
        </div>
      </div>
      <div class="run-list" id="runList" role="listbox" aria-label="Trace runs"></div>
    </aside>

    <section class="main">
      <section class="panel" id="tracePanel" aria-live="polite">
        <div class="trace-header">
          <div class="titlebar">
            <h2 style="margin:0; font-size:18px;">Trace</h2>
            <span class="chip" id="modelChip">model: unknown</span>
            <span class="chip" id="statusChip">status: —</span>
          </div>
          <div class="metrics">
            <div class="metric"><b>Duration</b><span id="duration">—</span></div>
            <div class="metric"><b>Start</b><span id="startTime">—</span></div>
            <div class="metric"><b>End</b><span id="endTime">—</span></div>
            <div class="metric" style="min-width:220px;">
              <b>Progress</b>
              <div class="progress" aria-label="Progress"><i id="progBar"></i></div>
            </div>
          </div>
        </div>

        <div class="accordion" id="accordion">
          <div class="acc open">
            <button type="button" aria-expanded="true"><span>Input</span><span>▼</span></button>
            <div class="content"><pre id="inputPre"></pre></div>
          </div>
          <div class="acc open">
            <button type="button" aria-expanded="true"><span>Final</span><span>▼</span></button>
            <div class="content"><pre id="finalPre"></pre></div>
          </div>
          <div class="acc open">
            <button type="button" aria-expanded="true"><span>Messages</span><span>▼</span></button>
            <div class="content">
              <div class="tags" id="roleTags"></div>
              <div class="msg-list" id="msgList"></div>
            </div>
          </div>
          <div class="acc open">
            <button type="button" aria-expanded="true"><span>Events</span><span>▼</span></button>
            <div class="content">
              <div class="events">
                <table id="eventsTable">
                  <thead><tr><th style="width:160px">time</th><th>level</th><th>args</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="footer">
          <div>Tip: Press <b>/</b> to focus search • <b>F</b> to filter by role • <b>E</b> to expand/collapse all</div>
          <div id="selectionInfo"></div>
        </div>
      </section>
    </section>
  </main>

  <template id="msgTpl">
    <div class="msg">
      <div class="head">
        <span class="role">role</span>
        <div style="display:flex; gap:8px">
          <button class="btn" data-copy>Copy</button>
          <button class="btn" data-collapse>Collapse</button>
        </div>
      </div>
      <pre class="code"></pre>
    </div>
  </template>

  <script>
    // Embedded data from trace JSON files
    var data = { runs: ${JSON.stringify(runs)} };

    var $ = function(sel){ return document.querySelector(sel); };
    var $$ = function(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    var fmt = function(ms){ return (ms/1000).toFixed(2) + 's'; };
    function prettyJson(obj){
      if (obj === null || obj === undefined) return '';
      var json;
      if (typeof obj === 'string') { json = obj; }
      else { try { json = JSON.stringify(obj, null, 2); } catch(e) { json = String(obj); } }
      json = String(json).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      json = json.replace(/(".*?":)/g,'<span class="json-key">$1<\/span>')
                 .replace(/(".*?")(?!\s*:)/g,'<span class="json-str">$1<\/span>')
                 .replace(/\b(-?\d+(?:\.\d+)?)\b/g,'<span class="json-num">$1<\/span>');
      return json;
    }
    function copy(txt){ if(navigator.clipboard){ navigator.clipboard.writeText(txt); } }

    var runListEl = $('#runList');
    var runsCount = $('#runsCount');
    function renderRuns(list){
      runListEl.innerHTML = '';
      list.forEach(function(r){
        var el = document.createElement('div');
        el.className = 'run'; el.setAttribute('role','option'); el.tabIndex = 0; el.dataset.id = r.id;
        el.innerHTML = '<div class="title">'+(r.title||r.id)+'</div>' +
          '<div class="meta">' +
            '<span>'+ (r.time ? new Date(r.time).toLocaleString() : '') +'</span>' +
            '<span class="status '+ r.status +'">'+ r.status +'</span>' +
            '<span>'+ (r.duration?fmt(r.duration):'') +'</span>' +
          '</div>';
        el.addEventListener('click', function(){ selectRun(r.id); });
        el.addEventListener('keydown', function(e){ if(e.key==='Enter') selectRun(r.id); });
        runListEl.appendChild(el);
      });
      runsCount.textContent = list.length + ' run' + (list.length===1?'':'s');
    }

    var currentRun = null;
    function selectRun(id){
      currentRun = data.runs.find(function(r){ return r.id===id; }) || data.runs[0];
      $$('.run').forEach(function(el){ el.classList.toggle('active', el.dataset.id===id); });
      updateTracePanel();
    }

    function updateTracePanel(){
      if(!currentRun) return;
      $('#modelChip').textContent = 'model: ' + (currentRun.model||'unknown');
      var statusChip = $('#statusChip');
      statusChip.textContent = 'status: ' + currentRun.status;
      statusChip.className = 'chip';
      if(currentRun.status==='success') statusChip.style.borderColor='rgba(54,211,153,.35)';
      if(currentRun.status==='failed') statusChip.style.borderColor='rgba(251,113,133,.35)';
      $('#duration').textContent = currentRun.duration?fmt(currentRun.duration):'—';
      $('#startTime').textContent = currentRun.start ? new Date(currentRun.start).toLocaleString() : '—';
      $('#endTime').textContent = currentRun.end ? new Date(currentRun.end).toLocaleString() : '—';
      $('#progBar').style.width = (currentRun.progress||0) + '%';
      $('#inputPre').innerHTML = prettyJson(currentRun.input||'');
      $('#finalPre').innerHTML = prettyJson(currentRun.final||'');
      renderRoleTags();
      renderMessages(currentRun.messages||[]);
      renderEvents(currentRun.events||[]);
    }

    function renderRoleTags(){
      var roles = []; (currentRun.messages||[]).forEach(function(m){ if(roles.indexOf(m.role)<0) roles.push(m.role); });
      var box = $('#roleTags'); box.innerHTML='';
      roles.forEach(function(role,i){
        var t = document.createElement('button'); t.className='tag'; t.textContent=role; t.dataset.role=role;
        t.addEventListener('click', function(){ $$('.tag').forEach(function(x){x.classList.remove('active');}); t.classList.add('active'); filterMessages(role); });
        box.appendChild(t);
      });
      var all = document.createElement('button'); all.className='tag active'; all.textContent='All'; all.dataset.role='*';
      all.addEventListener('click', function(){ $$('.tag').forEach(function(x){x.classList.remove('active');}); all.classList.add('active'); filterMessages('*'); });
      box.prepend(all);
    }
    function renderMessages(msgs){
      var list = $('#msgList'); list.innerHTML='';
      var tpl = $('#msgTpl');
      msgs.forEach(function(m){
        var node = tpl.content.cloneNode(true);
        var roleEl = node.querySelector('.role'); roleEl.textContent = m.role; roleEl.classList.add(m.role||'');
        var pre = node.querySelector('pre.code');
        pre.innerHTML = prettyJson(m.content);
        node.querySelector('[data-copy]').addEventListener('click', function(){ copy(typeof m.content==='string'? m.content : JSON.stringify(m.content,null,2)); });
        node.querySelector('[data-collapse]').addEventListener('click', function(e){ pre.classList.toggle('hidden'); e.target.textContent = pre.classList.contains('hidden')? 'Expand' : 'Collapse'; });
        list.appendChild(node);
      });
      $('#selectionInfo').textContent = msgs.length + ' message' + (msgs.length===1?'':'s');
    }
    function filterMessages(role){ var msgs = role==='*' ? (currentRun.messages||[]) : (currentRun.messages||[]).filter(function(m){return m.role===role;}); renderMessages(msgs); }
    function renderEvents(events){
      var tbody = $('#eventsTable tbody'); tbody.innerHTML='';
      (events||[]).forEach(function(ev){
        var tr = document.createElement('tr');
        var t = document.createElement('td'); t.textContent = ev.time ? new Date(ev.time).toLocaleString() : '';
        var l = document.createElement('td'); l.textContent = ev.level || '';
        var a = document.createElement('td'); var code = document.createElement('pre');
        var args = ev && typeof ev.args !== 'undefined' ? ev.args : '';
        var text;
        if (Array.isArray(args)) {
          try {
            text = args.map(function(x){
              try { return JSON.stringify(x, null, 2); } catch(e) { return String(x); }
            }).join('\n');
          } catch(e) { text = String(args); }
        } else {
          text = args;
        }
        code.innerHTML = prettyJson(text);
        a.appendChild(code);
        tr.appendChild(t); tr.appendChild(l); tr.appendChild(a); tbody.appendChild(tr);
      });
    }

    document.getElementById('accordion').addEventListener('click', function(e){
      var btn = e.target.closest('button');
      var acc = btn ? btn.closest('.acc') : null;
      if (btn && acc && btn.parentElement === acc) {
        var isOpen = acc.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen);
      }
    });
    var root = document.documentElement;
    function applyTheme(theme){ if(theme==='light'){ root.setAttribute('data-theme','light'); } else { root.removeAttribute('data-theme'); } localStorage.setItem('trace_theme', theme); }
    var saved = localStorage.getItem('trace_theme') || '${style}';
    if(saved==='light'){ applyTheme('light'); document.getElementById('lightBtn').classList.add('active'); document.getElementById('darkBtn').classList.remove('active'); }
    else { applyTheme('dark'); document.getElementById('darkBtn').classList.add('active'); document.getElementById('lightBtn').classList.remove('active'); }
    document.getElementById('lightBtn').onclick = function(){ applyTheme('light'); this.classList.add('active'); document.getElementById('darkBtn').classList.remove('active'); };
    document.getElementById('darkBtn').onclick = function(){ applyTheme('dark'); this.classList.add('active'); document.getElementById('lightBtn').classList.remove('active'); };
    document.getElementById('runSearch').addEventListener('input', function(e){ var q=e.target.value.toLowerCase(); var filtered=data.runs.filter(function(r){return (r.title||'').toLowerCase().includes(q);}); renderRuns(filtered); });
    document.addEventListener('keydown', function(e){ if(e.key === '/') { e.preventDefault(); document.getElementById('runSearch').focus(); } if(e.key.toLowerCase()==='f'){ var first=document.querySelector('#roleTags .tag'); if(first) first.click(); } if(e.key.toLowerCase()==='e'){ $$('.acc > button').forEach(function(btn){ btn.click(); }); } });
    document.getElementById('exportJson').addEventListener('click', function(){ var blob=new Blob([JSON.stringify(currentRun||data.runs[0],null,2)],{type:'application/json'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='trace.json'; a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000); });
    document.getElementById('refreshBtn').addEventListener('click', function(){ var bar=document.getElementById('progBar'); bar.style.transition='width .6s ease'; bar.style.width='0%'; setTimeout(function(){ bar.style.width='100%'; }, 60); });
    renderRuns(data.runs); if(data.runs.length){ selectRun(data.runs[0].id); }
  </script>
</body>
</html>`;

  fs.writeFileSync(pathMod.join(dir, 'trace.html'), html, 'utf8');
}

function findLogoDataUrl(fs: any, pathMod: any, startDir: string): string {
  const candidates = ['sisu-logo.jpg', 'sisu-logo.png', 'sisu-logo.svg'];
  function tryRead(p: string) {
    try {
      if (!fs.existsSync(p)) return '';
      const ext = p.toLowerCase().split('.').pop();
      if (ext === 'svg') {
        const svg = fs.readFileSync(p, 'utf8');
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      }
      const buf = fs.readFileSync(p);
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,` + buf.toString('base64');
    } catch { return ''; }
  }
  // Walk up to 6 directories looking for the logo
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    for (const name of candidates) {
      const p = pathMod.join(dir, name);
      const data = tryRead(p);
      if (data) return data;
    }
    const parent = pathMod.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  // Lastly, try CWD explicitly
  for (const name of candidates) {
    const data = tryRead(pathMod.join(process.cwd(), name));
    if (data) return data;
  }
  return '';
}

function getPalette(style: TraceStyle) {
  switch (style) {
    case 'dark':
      return { bg: '#0b0f14', fg: '#e6edf3', muted: '#9da7b3', card: '#0f1621', border: '#233041', accent: '#3b82f6' };
    case 'light':
    default:
      return { bg: '#ffffff', fg: '#111827', muted: '#6b7280', card: '#f6f8fa', border: '#e5e7eb', accent: '#6366f1' };
  }
}
