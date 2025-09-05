import type { Ctx, Middleware } from '@sisu-ai/core';
import { createTracingLogger } from '@sisu-ai/core';

export type TraceStyle = 'light' | 'dark';

export interface TraceMeta {
  start: string;
  end: string;
  durationMs: number;
  status: 'success' | 'error';
  model?: string;
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

    const traceArgPath = argFlag && argFlag.includes('=') ? argFlag.split('=')[1] : '';
    const explicitPath = Boolean(opts.path || traceArgPath);
    const defaultDir = opts.dir || 'traces';
    const path = opts.path || traceArgPath || 'trace.json';
    const wantHtml = opts.html ?? true;
    const wantJson = opts.json ?? true;
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
        },
      };

      const fs = await import('node:fs');
      const pathMod = await import('node:path');
      const html = (typeof opts.template === 'function') ? opts.template(out, style) : renderTraceHtml(out, style);

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
      if (lower.endsWith('.html')) {
        if (wantHtml) { fs.writeFileSync(targetPath, html, 'utf8'); }
      } else if (lower.endsWith('.json')) {
        if (wantJson) { fs.writeFileSync(targetPath, JSON.stringify(out, null, 2), 'utf8'); }
        if (wantHtml) { const hp = targetPath.replace(/\.json$/i, '.html'); fs.writeFileSync(hp, html, 'utf8'); }
      } else {
        if (wantJson) { fs.writeFileSync(targetPath, JSON.stringify(out, null, 2), 'utf8'); }
        if (wantHtml) { fs.writeFileSync(targetPath + '.html', html, 'utf8'); }
      }

      // If writing into a traces dir, maintain an index listing and link to latest
      try {
        const dir = explicitPath ? pathMod.dirname(targetPath) : tracesDir;
        writeIndex(fs, pathMod, dir, style);
      } catch {}
    }
  };
}

function renderTraceHtml(out: TraceDoc, style: TraceStyle = 'light'): string {
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const palette = getPalette(style);
  const css = `
  :root{--bg:${palette.bg};--fg:${palette.fg};--muted:${palette.muted};--card:${palette.card};--border:${palette.border};--accent:${palette.accent}}
  *{box-sizing:border-box}
  body{font-family:system-ui,Arial,sans-serif;margin:20px;background:var(--bg);color:var(--fg)}
  h1{font-size:20px;margin:0 0 10px}
  .section{margin:16px 0}
  .grid{display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:start}
  pre{background:var(--card);padding:8px;border-radius:6px;overflow:auto;border:1px solid var(--border)}
  details{margin:6px 0}
  details>summary{cursor:pointer}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid var(--border);padding:6px;font-size:12px;vertical-align:top}
  th{background:var(--card);text-align:left}
  code{font-family:ui-monospace,Consolas,monospace}
  .chip{display:inline-block;padding:2px 6px;border-radius:999px;color:#fff;font-size:11px;margin-right:6px}
  .role-user{background:#2563eb}
  .role-assistant{background:#10b981}
  .role-system{background:#6b7280}
  .role-tool{background:#d97706}
  .snippet{color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .msg-summary{display:flex;align-items:center;gap:6px}
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
    <h1>Trace</h1>
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
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

function timestamp(d = new Date()) {
  const pad = (n: number, s = 2) => String(n).padStart(s, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function writeIndex(fs: any, pathMod: any, dir: string, style: TraceStyle) {
  const esc = (s: string) => s.replace(/[&<>]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const files: string[] = fs.readdirSync(dir).filter((f: string) => f.endsWith('.html') && f.startsWith('run-'));
  files.sort();
  const latest = files[files.length - 1];
  const paletteAll = { light: getPalette('light'), dark: getPalette('dark') } as any;
  const css = `:root{--bg:${paletteAll[style].bg};--fg:${paletteAll[style].fg};--muted:${paletteAll[style].muted};--card:${paletteAll[style].card};--border:${paletteAll[style].border};--accent:${paletteAll[style].accent}}
  *{box-sizing:border-box} body{margin:0;display:grid;grid-template-columns:280px 1fr;grid-template-rows:auto 1fr;height:100vh;font-family:system-ui,Arial,sans-serif;background:var(--bg);color:var(--fg)}
  header{grid-column:1/3;padding:12px 16px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center}
  header h1{font-size:16px;margin:0 8px 0 0}
  header select{background:var(--card);color:var(--fg);border:1px solid var(--border);padding:4px;border-radius:6px}
  aside{border-right:1px solid var(--border);overflow:auto;padding:12px;background:var(--card)}
  main{overflow:hidden}
  ul{list-style:none;padding:0;margin:0}
  li{padding:6px 8px;border-bottom:1px solid var(--border);}
  a{color:var(--fg);text-decoration:none;display:block}
  a:hover{text-decoration:underline}
  .latest{color:var(--accent);font-weight:600}
  .status{padding:0 4px;border-radius:4px;font-size:10px;color:#fff;margin-left:4px}
  .status.success{background:#16a34a}
  .status.error{background:#dc2626}
  iframe{border:0;width:100%;height:100%}
  .muted{color:var(--muted)}
  `;

  const runs = files.slice().reverse().map(f => {
    const jp = pathMod.join(dir, f.replace(/\.html$/, '.json'));
    let doc: any = {};
    try { if (fs.existsSync(jp)) doc = JSON.parse(fs.readFileSync(jp, 'utf8')); } catch {}
    const snippet = (doc.input || '').slice(0, 50);
    const meta = doc.meta || {};
    return { file: f, snippet, meta };
  });
  const runsList = runs.map(r => {
    const dur = r.meta.durationMs ? (r.meta.durationMs / 1000).toFixed(2) + 's' : '';
    const status = r.meta.status || 'success';
    return `<li><a href="#" data-file="${encodeURI(r.file)}"><div>${esc(r.snippet || r.file)} <span class="status ${status}">${status}</span>${r.file===latest ? ' <span class=\"latest\">(latest)</span>' : ''}</div><div class="muted">${esc(r.meta.start || '')} ${dur ? '· '+dur : ''}</div></a></li>`;
  }).join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Traces</title><style>${css}</style></head>
  <body>
    <header>
      <h1>Traces</h1>
      <div class="muted">${files.length} run${files.length === 1 ? '' : 's'}</div>
      <div style="flex:1"></div>
      <label for="theme" class="muted">Theme:</label>
      <select id="theme">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      ${latest ? `<a id="open-latest" href="#" data-file="${encodeURI(latest)}" style="margin-left:12px;color:var(--accent)"><b>Open latest</b></a>` : ''}
    </header>
    <aside>
      <ul id="runs">${runsList || '<li class="muted">No traces yet</li>'}</ul>
    </aside>
    <main>
      <iframe id="viewer" src="${latest ? encodeURI(latest) : ''}"></iframe>
    </main>
    <script>
      (function(){
        var palettes = ${JSON.stringify({ light: getPalette('light'), dark: getPalette('dark') })};
        function setTheme(theme){
          var p = palettes[theme] || palettes.light;
          var st = document.getElementById('trace-index-theme');
          if (!st) { st = document.createElement('style'); st.id = 'trace-index-theme'; document.head.appendChild(st); }
          st.textContent = ":root{--bg:"+p.bg+";--fg:"+p.fg+";--muted:"+p.muted+";--card:"+p.card+";--border:"+p.border+";--accent:"+p.accent+"}";
        }
        function currentTheme(){ var sel = document.getElementById('theme'); return (sel && sel.value) || localStorage.getItem('trace_theme') || '${style}'; }
        function saveTheme(t){ try{ localStorage.setItem('trace_theme', t); }catch(e){} }
        function sendTheme(){ var v = document.getElementById('viewer'); try{ if (v && v.contentWindow) v.contentWindow.postMessage({ type:'TRACE_THEME', theme: currentTheme() }, '*'); }catch(err){} }
        function openFile(f){ var v = document.getElementById('viewer'); if(f && v){ v.setAttribute('src', f); v.addEventListener('load', function onl(){ v.removeEventListener('load', onl); sendTheme(); }); } }

        // Init theme selector
        var sel = document.getElementById('theme');
        if (sel) {
          sel.value = currentTheme();
          sel.addEventListener('change', function(){ setTheme(sel.value); saveTheme(sel.value); sendTheme(); });
        }
        setTheme(currentTheme());

        // Click handlers
        var runsEl = document.getElementById('runs');
        if (runsEl) runsEl.addEventListener('click', function(e){
          var t = e.target;
          while (t && t.tagName && t.tagName.toLowerCase() !== 'a') { t = t.parentNode; }
          if (t && t.tagName && t.tagName.toLowerCase() === 'a') { e.preventDefault(); openFile(t.getAttribute('data-file')); }
        });
        var latestEl = document.getElementById('open-latest');
        if (latestEl) latestEl.addEventListener('click', function(e){ e.preventDefault(); openFile(latestEl.getAttribute('data-file')); });

        // Push theme to current iframe if already loaded
        var v = document.getElementById('viewer');
        if (v && v.getAttribute('src')) { sendTheme(); }
      })();
    </script>
  </body></html>`;
  fs.writeFileSync(pathMod.join(dir, 'trace.html'), html, 'utf8');
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
