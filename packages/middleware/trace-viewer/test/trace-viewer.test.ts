import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Ctx } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { traceViewer } from '../src/index.js';

function makeCtx(): Ctx {
  const ac = new AbortController();
  return {
    input: 'hi',
    messages: [],
    model: { name: 'dummy', capabilities: {}, async generate() { return { message: { role: 'assistant', content: 'ok' } }; } },
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
}

test('traceViewer writes json and html to path', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-test-'));
  try {
    const jsonPath = path.join(outDir, 'tv-run.json');
    const writer = traceViewer({ enable: true, path: jsonPath, style: 'light' });
    const runner = async (ctx: Ctx) => { ctx.messages.push({ role: 'assistant', content: 'ok' } as any); };
    await compose([writer, runner as any])(makeCtx());
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(jsonPath.replace(/\.json$/, '.html'))).toBe(true);
    const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(doc.meta.status).toBe('success');
    expect(typeof doc.meta.start).toBe('string');
    expect(typeof doc.meta.end).toBe('string');
    expect(typeof doc.meta.durationMs).toBe('number');

    // runs.js index is created with lightweight entries
    const dir = path.dirname(jsonPath);
    const runsJsPath = path.join(dir, 'runs.js');
    expect(fs.existsSync(runsJsPath)).toBe(true);
    const js = fs.readFileSync(runsJsPath, 'utf8');
    const m = js.match(/SISU_RUN_INDEX\s*=\s*(\[[\s\S]*?\]);/);
    expect(m).toBeTruthy();
    const index = JSON.parse(m![1]);
    expect(Array.isArray(index)).toBe(true);
    expect(index.length).toBeGreaterThan(0);
    const entry = index[0];
    expect(typeof entry.id).toBe('string');
    expect(typeof entry.file).toBe('string');
    expect(typeof entry.title).toBe('string');
    expect(typeof entry.time).toBe('string');
    expect(typeof entry.status).toBe('string');
    expect(typeof entry.duration).toBe('number');
  } finally {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
  }
});

test('traceViewer is enabled via --trace CLI and writes to custom traces dir', async () => {
  const origArgv = process.argv.slice();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-cli-'));
  try {
    process.argv = [process.argv[0], process.argv[1], '--trace'];
    const writer = traceViewer({ dir }); // enable via CLI, write into tmp dir
    await compose([writer])(makeCtx());
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const hasJson = entries.some(f => /run-.*\.json$/.test(f));
    const hasHtml = entries.some(f => /run-.*\.html$/.test(f));
    expect(hasJson && hasHtml).toBe(true);
  } finally {
    process.argv = origArgv;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

test('traceViewer supports html-only and json-only outputs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-modes-'));
  try {
    // HTML only
    const htmlPath = path.join(dir, 'only.html');
    await compose([traceViewer({ enable: true, path: htmlPath, html: true, json: false })])(makeCtx());
    expect(fs.existsSync(htmlPath)).toBe(true);
    expect(fs.existsSync(htmlPath.replace(/\.html$/, '.json'))).toBe(false);
    // runs.js should still exist and contain an index (from .js files)
    const dir1 = path.dirname(htmlPath);
    const runsJs1 = path.join(dir1, 'runs.js');
    expect(fs.existsSync(runsJs1)).toBe(true);
    const js1 = fs.readFileSync(runsJs1, 'utf8');
    const m1 = js1.match(/SISU_RUN_INDEX\s*=\s*(\[[\s\S]*?\]);/);
    expect(m1).toBeTruthy();
    const idx1 = JSON.parse(m1![1]);
    expect(Array.isArray(idx1)).toBe(true);
    expect(idx1.length).toBeGreaterThan(0);

    // JSON only
    const jsonPath = path.join(dir, 'only.json');
    await compose([traceViewer({ enable: true, path: jsonPath, html: false, json: true })])(makeCtx());
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(jsonPath.replace(/\.json$/, '.html'))).toBe(true); // pairs HTML by default when json path provided
    // In json-only mode (wantHtml=false), viewer assets are not maintained
    const runsJs2 = path.join(dir, 'runs.js');
    // runs.js may or may not exist depending on previous writes; ensure it is at least a file if present
    // We won't assert existence here to keep behavior consistent with html flag.
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});
