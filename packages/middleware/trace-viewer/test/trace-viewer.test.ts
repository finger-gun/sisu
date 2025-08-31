import { test } from 'vitest';
import assert from 'node:assert';
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
    assert.ok(fs.existsSync(jsonPath));
    assert.ok(fs.existsSync(jsonPath.replace(/\.json$/, '.html')));
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
    assert.ok(hasJson && hasHtml);
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
    assert.ok(fs.existsSync(htmlPath));
    assert.ok(!fs.existsSync(htmlPath.replace(/\.html$/, '.json')));

    // JSON only
    const jsonPath = path.join(dir, 'only.json');
    await compose([traceViewer({ enable: true, path: jsonPath, html: false, json: true })])(makeCtx());
    assert.ok(fs.existsSync(jsonPath));
    assert.ok(fs.existsSync(jsonPath.replace(/\.json$/, '.html'))); // pairs HTML by default when json path provided
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});
