(function () {
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var fmt = function (ms) { return (ms / 1000).toFixed(2) + 's'; };

  function prettyJson(obj) {
    if (obj === null || obj === undefined) return '';
    var json;
    if (typeof obj === 'string') { json = obj; }
    else { try { json = JSON.stringify(obj, null, 2); } catch (e) { json = String(obj); } }
    json = String(json).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    json = json.replace(/(".*?":)/g, '<span class="json-key">$1<\/span>')
      .replace(/(".*?")(?!\s*:)/g, '<span class="json-str">$1<\/span>')
      .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="json-num">$1<\/span>');
    return json;
  }
  function copy(txt) { if (navigator.clipboard) { navigator.clipboard.writeText(txt); } }

  // --- Global state & logo ---
  window.SISU_TRACES = window.SISU_TRACES || { runs: [], logo: '' };

  // --- Utils: normalize a run object from .json or .js shapes ---
  function normalizeAndPushRun(obj) {
    try {
      // In your .json, meta carries timing/status/model; in .js it's already flattened.  
      var meta = obj.meta || {};
      var id = obj.id || meta.id || ('run-' + (meta.start || Date.now()));
      var events = (obj.events || []).map(function (ev) {
        return { time: ev.time || ev.ts || null, level: ev.level || '', args: ev.args };
      }); // .json uses `ts`, .js uses `time`.  

      var run = {
        id,
        file: obj.file || meta.file || '',
        title: obj.title || (obj.input ? String(obj.input).slice(0, 120) : id),
        time: obj.time || meta.start || null,
        status: obj.status || meta.status || 'unknown',
        duration: obj.duration || meta.durationMs || 0,
        model: obj.model || meta.model || 'unknown',
        input: obj.input || '',
        final: obj.final || '',
        start: obj.start || meta.start || null,
        end: obj.end || meta.end || null,
        messages: obj.messages || [],
        events
      };

      (window.SISU_TRACES.runs = window.SISU_TRACES.runs || []).push(run);
    } catch (e) {
      console.warn('normalize error', e);
    }
  }

  // --- Loader: supports both .js (self-registering) and .json (fetch) ---
  function loadRunScripts(list, done) {
    var unique = Array.from(new Set(list || []));              // de-dupe
    var remaining = unique.length;                             // FIX: count unique, not original
    if (!remaining) return done();

    unique.forEach(function (src) {
      if (/\.json$/i.test(src)) {
        fetch(src)
          .then(function (r) { return r.json(); })
          .then(function (obj) { normalizeAndPushRun(obj); checkDone(); })
          .catch(function () { checkDone(); });
      } else {
        var s = document.createElement('script');
        s.src = src;
        s.onload = s.onerror = function () { checkDone(); };
        document.head.appendChild(s);
      }
    });

    function checkDone() { remaining--; if (remaining <= 0) done(); }
  }

  // --- Renderers ---
  var runListEl = $('#runList');
  var runsCount = $('#runsCount');

  // Locale-aware datetime (24h, local ordering)
  function formatDateTime(ts){
    if (!ts) return '';
    var stored = (function(){ try { return localStorage.getItem('trace_locale'); } catch(_) { return null; } })();
    var override = (stored && stored !== 'auto') ? stored : '';
    var loc = override
           || (navigator.languages && navigator.languages[0])
           || (Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions && Intl.DateTimeFormat().resolvedOptions().locale)
           || (navigator && navigator.language)
           || 'sv-SE';
    var d = (ts instanceof Date) ? ts : new Date(ts);
    var date = d.toLocaleDateString(loc);
    var time = d.toLocaleTimeString(loc);
    return date + ' ' + time;
  }

  function renderRuns(list) {
    runListEl.innerHTML = '';
    (list || []).forEach(function (r) {
      var el = document.createElement('div');
      el.className = 'run'; el.setAttribute('role', 'option'); el.tabIndex = 0; el.dataset.id = r.id;
      el.innerHTML =
        '<div class="title">' + (r.title || r.id) + '</div>' +
        '<div class="meta">' +
        '<span>' + (r.time ? formatDateTime(r.time) : '') + '</span>' +
        '<span class="status ' + (r.status || '') + '">' + (r.status || '') + '</span>' +
        '<span>' + (r.duration ? fmt(r.duration) : '') + '</span>' +
        '</div>';
      el.addEventListener('click', function () { selectRun(r.id); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') selectRun(r.id); });
      runListEl.appendChild(el);
    });
    runsCount.textContent = list.length + ' run' + (list.length === 1 ? '' : 's');
  }

  var currentRun = null;
  function selectRun(id) {
    var runs = (window.SISU_TRACES && window.SISU_TRACES.runs) || [];
    currentRun = runs.find(function (r) { return r.id === id; }) || runs[0] || null;
    $$('.run').forEach(function (el) { el.classList.toggle('active', el.dataset.id === id); });
    updateTracePanel();
  }

  function updateTracePanel() {
    if (!currentRun) return;
    $('#modelChip').textContent = 'model: ' + (currentRun.model || 'unknown');
    var statusChip = $('#statusChip');
    statusChip.textContent = 'status: ' + (currentRun.status || '');
    statusChip.className = 'chip';
    statusChip.style.borderColor = '';
    if (currentRun.status === 'success') statusChip.style.borderColor = 'rgba(54,211,153,.35)';
    if (currentRun.status === 'failed') statusChip.style.borderColor = 'rgba(251,113,133,.35)';
    $('#duration').textContent = currentRun.duration ? fmt(currentRun.duration) : '—';
    $('#startTime').textContent = currentRun.start ? formatDateTime(currentRun.start) : '—';
    $('#endTime').textContent = currentRun.end ? formatDateTime(currentRun.end) : '—';

    // Usage metrics (if present)
    renderUsageMetrics(currentRun.usage || {});
    renderCodeInto($('#inputPre'), currentRun.input, { lines: true });
    renderCodeInto($('#finalPre'), currentRun.final, { lines: true });
    renderRoleTags();
    renderMessages(currentRun.messages || []);
    // Events: render level tags + apply level filter
    currentLevel = '*';
    renderLevelTags();
    applyEventFilter();
  }

  function renderUsageMetrics(usage){
    var wrap = document.querySelector('.metrics');
    if (!wrap) return;
    // Helper to create/update a tile
    function setTile(id, label, value){
      var el = document.getElementById(id);
      if (!value && value !== 0) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('div');
        el.className = 'metric';
        el.id = id;
        el.innerHTML = '<b></b><span></span>';
        wrap.appendChild(el);
      }
      el.querySelector('b').textContent = label;
      el.querySelector('span').textContent = value;
    }
    var nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
    var cf2 = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var cfSmall = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 6 });
    setTile('metricPrompt', 'Prompt tokens', usage.promptTokens != null ? nf.format(usage.promptTokens) : undefined);
    setTile('metricCompletion', 'Completion tokens', usage.completionTokens != null ? nf.format(usage.completionTokens) : undefined);
    setTile('metricTotal', 'Total tokens', usage.totalTokens != null ? nf.format(usage.totalTokens) : undefined);
    if (usage.costUSD != null) {
      var c = Number(usage.costUSD);
      var costStr = (c > 0 && c < 0.01) ? cfSmall.format(c) : cf2.format(c);
      setTile('metricCost', 'Cost (est.)', costStr);
    } else {
      setTile('metricCost', 'Cost (est.)', undefined);
    }
    // Optional image-related metrics (shown only if present)
    setTile('metricImgTokens', 'Image tokens', usage.imageTokens != null ? nf.format(usage.imageTokens) : undefined);
    setTile('metricImgCount', 'Images', usage.imageCount != null ? nf.format(usage.imageCount) : undefined);
  }

  function renderRoleTags() {
    var roles = [];
    (currentRun.messages || []).forEach(function (m) { if (m && roles.indexOf(m.role) < 0) roles.push(m.role); });
    var box = $('#roleTags'); box.innerHTML = '';
    roles.forEach(function (role) {
      var t = document.createElement('button'); t.className = 'tag'; t.textContent = role; t.dataset.role = role;
      t.addEventListener('click', function () { $$('.tag').forEach(function (x) { x.classList.remove('active'); }); t.classList.add('active'); filterMessages(role); });
      box.appendChild(t);
    });
    var all = document.createElement('button'); all.className = 'tag active'; all.textContent = 'All'; all.dataset.role = '*';
    all.addEventListener('click', function () { $$('.tag').forEach(function (x) { x.classList.remove('active'); }); all.classList.add('active'); filterMessages('*'); });
    box.prepend(all);
  }

  function renderMessages(msgs) {
    var list = document.querySelector('#msgList'); list.innerHTML = '';
    var tpl = document.querySelector('#msgTpl');

    // Build a lookup of tool_call_id -> tool name from the full run messages
    var toolNameById = {};
    (currentRun.messages || []).forEach(function(mm){
      if (mm && mm.role === 'assistant' && Array.isArray(mm.tool_calls)) {
        mm.tool_calls.forEach(function(tc){
          if (tc && tc.id) toolNameById[String(tc.id)] = tc.name || 'tool';
        });
      }
    });

    var prevTs = null;
    (msgs || []).forEach(function (m) {
      var node = tpl.content.cloneNode(true);

      // Role
      var roleEl = node.querySelector('.role');
      roleEl.textContent = m.role || '—';
      roleEl.classList.add(m.role || '');

      // Payload
      var pre = node.querySelector('pre.code');
      var r = renderCodeInto(pre, m && m.content, { pretty: true });

      // Action buttons (Copy / Collapse + Raw/Pretty when JSON)
      var actions = node.querySelector('[data-copy]').parentElement;

      // Raw/Pretty toggle only if looks like JSON
      if (r.isJSON) {
        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn secondary';
        toggleBtn.textContent = 'Raw';
        var showPretty = true;
        toggleBtn.addEventListener('click', function () {
          showPretty = !showPretty;
          r.setPretty(showPretty);
          toggleBtn.textContent = showPretty ? 'Raw' : 'Pretty';
        });
        actions.insertBefore(toggleBtn, actions.firstChild);
      }

      // Copy (with feedback)
      var copyBtn = node.querySelector('[data-copy]');
      copyBtn.addEventListener('click', function () {
        var txt;
        try {
          txt = (typeof m.content === 'string') ? m.content : JSON.stringify(m.content || '', null, 2);
        } catch (e) { txt = String(m.content || ''); }
        navigator.clipboard && navigator.clipboard.writeText && navigator.clipboard.writeText(txt);
        // animate
        copyBtn.classList.remove('copied'); void copyBtn.offsetWidth;
        copyBtn.classList.add('copied');
        var original = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.classList.remove('copied'); copyBtn.textContent = original; }, 1200);
      });

      // Collapse
      var collapseBtn = node.querySelector('[data-collapse]');
      collapseBtn.setAttribute('aria-expanded', 'true');
      collapseBtn.addEventListener('click', function () {
        var isHidden = pre.classList.toggle('hidden');
        collapseBtn.textContent = isHidden ? 'Expand' : 'Collapse';
        collapseBtn.setAttribute('aria-expanded', String(!isHidden));
      });

      // Assistant tool-calls: summarize under header instead of header chips
      var isToolCall = (m.role === 'assistant') && Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
      if (isToolCall) {
        var names = m.tool_calls.map(function(tc){ return tc && tc.name ? String(tc.name) : 'tool'; });
        var ids = m.tool_calls.map(function(tc){ return tc && tc.id ? String(tc.id) : ''; }).filter(Boolean);
        var label = (names.length === 1)
          ? ('Tool call: ' + names[0] + (ids[0] ? ' (id: ' + ids[0] + ')' : ''))
          : (names.length + ' tool calls' + (ids.length ? ' (ids: ' + ids.join(', ') + ')' : ''));
        // Create or find meta container and insert line before pre
        var meta1 = document.createElement('div'); meta1.className = 'msg-meta';
        var line1 = document.createElement('div'); line1.className = 'meta-line'; line1.textContent = label; meta1.appendChild(line1);
        // Insert under content
        pre.parentElement.insertBefore(meta1, pre.nextSibling);
        // If message content was empty, re-render body to show the tool_calls JSON
        if (!m.content || String(m.content).trim() === '') {
          r = renderCodeInto(pre, m.tool_calls, { pretty: true });
        }
      }

      // Tool responses: show the tool_call_id + name under header
      if (m.role === 'tool' && m.tool_call_id) {
        var tid = String(m.tool_call_id);
        var tname = toolNameById[tid] || 'tool';
        var meta2 = document.createElement('div'); meta2.className = 'msg-meta';
        var line2 = document.createElement('div'); line2.className = 'meta-line'; line2.textContent = 'Tool response: ' + tname + ' (id: ' + tid + ')'; meta2.appendChild(line2);
        pre.parentElement.insertBefore(meta2, pre.nextSibling);
      }

      // Per-message duration: delta since previous stamped timestamp (if available)
      var curTs = null;
      try { if (m.ts) curTs = new Date(m.ts).getTime(); } catch(_) {}
      if (curTs && (!prevTs || curTs >= prevTs)) {
        var dt = prevTs ? (curTs - prevTs) : 0;
        if (dt > 0) {
          var meta3 = document.createElement('div'); meta3.className = 'msg-meta';
          var line3 = document.createElement('div'); line3.className = 'meta-line'; line3.textContent = 'Δ ' + (dt/1000).toFixed(2) + 's'; meta3.appendChild(line3);
          pre.parentElement.insertBefore(meta3, pre.nextSibling);
        }
        prevTs = curTs;
      }

      list.appendChild(node);
    });

    var n = (msgs || []).length;
    document.querySelector('#selectionInfo').textContent = n + ' message' + (n === 1 ? '' : 's');
  }

  function filterMessages(role) {
    var msgs = role === '*' ? (currentRun.messages || []) : (currentRun.messages || []).filter(function (m) { return m.role === role; });
    renderMessages(msgs);
  }

  function renderEvents(events) {
    var tbody = $('#eventsTable tbody'); tbody.innerHTML = '';
    (events || []).forEach(function (ev) {
      var tr = document.createElement('tr');
      var t = document.createElement('td'); t.textContent = (ev.time ? formatDateTime(ev.time) : '');  // also works for .json → ts mapped above
      var l = document.createElement('td'); l.textContent = ev.level || '';
      var a = document.createElement('td'); var code = document.createElement('pre');
      var args = ev && typeof ev.args !== 'undefined' ? ev.args : '';
      function fmtArg(x){
        if (typeof x === 'string') return x; // print strings as-is
        try { return JSON.stringify(x, null, 2); } catch (e) { return String(x); }
      }
      var text;
      if (Array.isArray(args)) {
        try {
          text = args.map(fmtArg).join('\n'); // real newline between elements
        } catch (e) { text = String(args); }
      } else {
        text = fmtArg(args);
      }
      // Render like message code blocks (with line numbers and wrapping)
      renderCodeInto(code, text, { pretty: true });
      a.appendChild(code);
      tr.appendChild(t); tr.appendChild(l); tr.appendChild(a); tbody.appendChild(tr);
    });
  }

  // --- Event level filtering ---
  var currentLevel = '*';
  function renderLevelTags(){
    var box = $('#levelTags'); if (!box) return;
    box.innerHTML = '';
    var levels = [];
    (currentRun.events || []).forEach(function(ev){ var lv = String(ev.level||'').toLowerCase(); if (lv && levels.indexOf(lv) < 0) levels.push(lv); });
    // Ensure a stable order if present
    var order = ['debug','info','warn','error','span'];
    levels.sort(function(a,b){ var ia = order.indexOf(a); var ib = order.indexOf(b); if(ia<0&&ib<0) return a.localeCompare(b); if(ia<0) return 1; if(ib<0) return -1; return ia-ib; });

    // All tag first
    var all = document.createElement('button'); all.className='tag active'; all.textContent='All'; all.dataset.level='*';
    all.addEventListener('click', function(){ $$('#levelTags .tag').forEach(function(x){x.classList.remove('active');}); all.classList.add('active'); currentLevel='*'; applyEventFilter(); });
    box.appendChild(all);

    // Individual levels
    levels.forEach(function(lv){
      var t = document.createElement('button'); t.className='tag'; t.textContent=lv; t.dataset.level=lv;
      t.addEventListener('click', function(){ $$('#levelTags .tag').forEach(function(x){x.classList.remove('active');}); t.classList.add('active'); currentLevel=lv; applyEventFilter(); });
      box.appendChild(t);
    });
  }

  function applyEventFilter(){
    var evs = (currentRun.events || []);
    if (currentLevel && currentLevel !== '*') {
      evs = evs.filter(function(ev){ return String(ev.level||'').toLowerCase() === currentLevel; });
    }
    renderEvents(evs);
  }

  // Accordion: only toggle when header button is clicked
  document.getElementById('accordion').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    var acc = btn ? btn.closest('.acc') : null;
    if (btn && acc && btn.parentElement === acc) {
      var isOpen = acc.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen);
    }
  });

  // Theme with persistence (works on file:// as well; guarded for privacy modes)
  var root = document.documentElement;
  function lsGet(k){ try { return window.localStorage && localStorage.getItem(k); } catch(_) { return null; } }
  function lsSet(k,v){ try { return window.localStorage && localStorage.setItem(k,v); } catch(_) { return null; } }
  function applyTheme(theme, persist){
    if (theme === 'light') { root.setAttribute('data-theme','light'); }
    else { root.removeAttribute('data-theme'); }
    if (persist) lsSet('trace_theme', theme);
  }
  var saved = lsGet('trace_theme');
  var prefersDark = false;
  try { prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch(_) {}
  var initialTheme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(initialTheme, false);
  if (initialTheme === 'light') { $('#lightBtn').classList.add('active'); $('#darkBtn').classList.remove('active'); }
  else { $('#darkBtn').classList.add('active'); $('#lightBtn').classList.remove('active'); }
  $('#lightBtn').onclick = function(){ applyTheme('light', true); this.classList.add('active'); $('#darkBtn').classList.remove('active'); };
  $('#darkBtn').onclick = function(){ applyTheme('dark', true); this.classList.add('active'); $('#lightBtn').classList.remove('active'); };

  // Locale selector persistence
  (function(){
    var sel = document.getElementById('localeSelect');
    if (!sel) return;
    var stored = (function(){ try { return localStorage.getItem('trace_locale'); } catch(_) { return null; } })();

    function addOption(value, text){
      if (!value) return; var exists = Array.prototype.some.call(sel.options, function(o){ return o.value===value; });
      if (exists) return; var opt = document.createElement('option'); opt.value = value; opt.textContent = text || value; sel.appendChild(opt);
    }
    // Build dynamic options from browser preferences, with fallback
    var preferred = (navigator.languages && navigator.languages.slice(0,6)) || (navigator.language ? [navigator.language] : []);
    // Lightweight extras in case prefs are too sparse
    var extras = ['sv-SE','en-SE','en-GB','en-US'];
    var seen = new Set();
    preferred.concat(extras).forEach(function(loc){ if (!loc) return; var k=String(loc); if (seen.has(k)) return; seen.add(k); addOption(k, k); });
    // Add "Other…" choice at end
    addOption('other', 'Other…');

    // If stored override exists and isn't in list, add it
    if (stored && stored !== 'auto' && stored !== 'other') addOption(stored, stored + ' (saved)');
    sel.value = stored || 'auto';

    sel.addEventListener('change', function(){
      var val = sel.value;
      if (val === 'other') {
        var current = (function(){ try { return localStorage.getItem('trace_locale') || ''; } catch(_) { return ''; } })();
        var input = (window.prompt && window.prompt('Enter BCP‑47 locale (e.g., sv-SE, en-SE, nb-NO):', current)) || '';
        input = input.trim();
        if (input) {
          // Basic validation: try constructing a formatter
          var ok = true;
          try { new Intl.DateTimeFormat(input).format(new Date()); } catch(_) { ok = false; }
          if (!ok) { alert('Invalid locale tag.'); sel.value = stored || 'auto'; return; }
          try { localStorage.setItem('trace_locale', input); } catch(_) {}
          addOption(input, input + ' (saved)');
          sel.value = input;
        } else {
          // keep prior value
          sel.value = stored || 'auto';
          return;
        }
      } else {
        try {
          if (val === 'auto') localStorage.removeItem('trace_locale');
          else localStorage.setItem('trace_locale', val);
        } catch(_) {}
      }
      // Re-render lists and current panel with new locale
      applyFilters();
      if (currentRun) updateTracePanel();
    });
  })();

  // Search + shortcuts
  $('#runSearch').addEventListener('input', function (e) {
    var q = e.target.value.toLowerCase();
    var runs = (window.SISU_TRACES.runs || []);
    var filtered = runs.filter(function (r) { return (r.title || '').toLowerCase().includes(q); });
    renderRuns(filtered);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/') { e.preventDefault(); $('#runSearch').focus(); }
    if (e.key.toLowerCase() === 'f') { var first = document.querySelector('#roleTags .tag'); if (first) first.click(); }
    if (e.key.toLowerCase() === 'e') { $$('.acc > button').forEach(function (btn) { btn.click(); }); }
  });

  // Export
  $('#exportJson').addEventListener('click', function () {
    var first = (window.SISU_TRACES.runs || [])[0];
    var blob = new Blob([JSON.stringify(currentRun || first, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'trace.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  // --- Boot: load .js and/or .json listed in runs.js ---
  function dedupeSortRuns() {
    var map = new Map();
    (window.SISU_TRACES.runs || []).forEach(function (r) { map.set(r.id, r); });
    window.SISU_TRACES.runs = Array.from(map.values()).sort(function (a, b) {
      return new Date(b.time || b.start || 0) - new Date(a.time || a.start || 0);
    });
  }

  var scriptList = window.SISU_RUN_SCRIPTS || [];   // set in runs.js  :contentReference[oaicite:8]{index=8}
  loadRunScripts(scriptList, function () {
    // If the JSON we fetched wasn’t wrapped, also normalize it here
    // (No-op for .js because run-*.js pushes into window.SISU_TRACES directly.) :contentReference[oaicite:9]{index=9}
    dedupeSortRuns();
    renderRuns(window.SISU_TRACES.runs || []);
    if ((window.SISU_TRACES.runs || []).length) { selectRun(window.SISU_TRACES.runs[0].id); }
  });

  // --- Combined filtering: search + date range -------------------------------
  var stateFilter = { q: '', from: '', to: '' };

  function runTimestamp(r) {
    return new Date(r.time || r.start || r.end || 0).getTime();
  }
  function atStartOfDayLocal(ymd) {
    if (!ymd) return -Infinity;
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0).getTime();
  }
  function atEndOfDayLocal(ymd) {
    if (!ymd) return Infinity;
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999).getTime();
  }
  function toLocalYMD(d) {
    if (!d) return '';
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }

  function applyFilters() {
    var runs = (window.SISU_TRACES.runs || []);
    var q = (stateFilter.q || '').toLowerCase();
    var fromTs = atStartOfDayLocal(stateFilter.from);
    var toTs = atEndOfDayLocal(stateFilter.to);

    var filtered = runs.filter(function (r) {
      var okText = !q || (r.title || '').toLowerCase().includes(q);
      var t = runTimestamp(r);
      var okDate = (t >= fromTs && t <= toTs);
      return okText && okDate;
    });

    renderRuns(filtered);
    if (filtered.length) {
      var keep = filtered.find(function (r) { return currentRun && r.id === currentRun.id; });
      selectRun((keep || filtered[0]).id);
    } else {
      $('#selectionInfo').textContent = '0 messages';
      $('#runList').innerHTML = '';
      $('#runsCount').textContent = '0 runs';
    }
  }

  // Search box → updates text filter
  $('#runSearch').addEventListener('input', function (e) {
    stateFilter.q = e.target.value || '';
    applyFilters();
  });

  // Date inputs + presets
  var dateFrom = document.getElementById('dateFrom');
  var dateTo = document.getElementById('dateTo');

  function setPreset(range) {
    document.querySelectorAll('.date-filter .chip.sm').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.querySelector('.date-filter .chip.sm[data-range="' + range + '"]');
    if (btn) btn.classList.add('active');

    var now = new Date();
    if (range === 'all') {
      stateFilter.from = ''; stateFilter.to = '';
      if (dateFrom) dateFrom.value = '';
      if (dateTo) dateTo.value = '';
    } else if (range === 'today') {
      var ymd = toLocalYMD(now);
      stateFilter.from = ymd; stateFilter.to = ymd;
      if (dateFrom) dateFrom.value = ymd;
      if (dateTo) dateTo.value = ymd;
    } else if (range === '7d') {
      var to = toLocalYMD(now);
      var from = toLocalYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
      stateFilter.from = from; stateFilter.to = to;
      if (dateFrom) dateFrom.value = from;
      if (dateTo) dateTo.value = to;
    } else if (range === '30d') {
      var to2 = toLocalYMD(now);
      var from2 = toLocalYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
      stateFilter.from = from2; stateFilter.to = to2;
      if (dateFrom) dateFrom.value = from2;
      if (dateTo) dateTo.value = to2;
    }
    applyFilters();
  }

  // Hook date inputs
  dateFrom && dateFrom.addEventListener('change', function () {
    stateFilter.from = this.value || '';
    document.querySelectorAll('.date-filter .chip.sm').forEach(function (b) { b.classList.remove('active'); });
    applyFilters();
  });
  dateTo && dateTo.addEventListener('change', function () {
    stateFilter.to = this.value || '';
    document.querySelectorAll('.date-filter .chip.sm').forEach(function (b) { b.classList.remove('active'); });
    applyFilters();
  });
  document.querySelectorAll('.date-filter .chip.sm').forEach(function (b) {
    b.addEventListener('click', function () { setPreset(this.dataset.range); });
  });

  dedupeSortRuns();
  renderRuns(window.SISU_TRACES.runs || []);
  if ((window.SISU_TRACES.runs || []).length) { selectRun(window.SISU_TRACES.runs[0].id); }

  // default preset: show everything
  if (document.querySelector('.date-filter')) { setPreset('all'); }

  // ---- JSON/code helpers ----
  function escapeHTML(s) { return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

  function syntaxHighlight(s){
  return s
    // keys: capture quoted string before colon
    .replace(/("(?:\\.|[^"\\])*?")\s*:/g, "<span class='json-key'>$1</span>:")
    // strings (not keys)
    .replace(/("(?:\\.|[^"\\])*")(?!\s*:)/g, "<span class='json-str'>$1</span>")
    // numbers
    .replace(/\b(-?\d+(?:\.\d+)?)\b/g, "<span class='json-num'>$1</span>")
    // booleans/null
    .replace(/\b(true|false|null)\b/g, "<span class='json-bool'>$1</span>");
}

  function detectJSON(value) {
    let raw = typeof value === 'string' ? value : (() => { try { return JSON.stringify(value); } catch { return String(value); } })();
    let parsed; try { parsed = JSON.parse(raw); } catch (_) { }
    if (parsed !== undefined) {
      const pretty = JSON.stringify(parsed, null, 2);
      return { isJSON: true, raw, pretty };
    }
    return { isJSON: false, raw: String(raw), pretty: null };
  }
  function withLineNumbers(html) {
    // html is already highlighted/escaped
    var lines = html.split('\n').map(l => `<span class="ln">${l || ' '}</span>`);
    return `<code>${lines.join('\n')}</code>`;
  }
  function renderCodeInto(preEl, value, opts) {
    const { isJSON, raw, pretty } = detectJSON(value);
    const mode = (opts && opts.pretty) === false ? 'raw' : 'pretty';
    const text = isJSON ? (mode === 'pretty' ? pretty : raw) : raw;

    const safe = escapeHTML(text);
    const colored = isJSON ? syntaxHighlight(safe) : safe;
    const lines = colored.split('\n');

    // Build OL
    const ol = document.createElement('ol');
    ol.className = 'code-ol';
    lines.forEach(lineHTML => {
      const li = document.createElement('li');
      li.innerHTML = lineHTML.length ? lineHTML : '&nbsp;';
      ol.appendChild(li);
    });

    // Inject
    preEl.classList.add('codeblock');
    preEl.innerHTML = '';
    preEl.appendChild(ol);

    // expose toggles to caller
    return {
      isJSON,
      setPretty(bool) {
        renderCodeInto(preEl, value, { pretty: !!bool });
      }
    };
  }

})();
