import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { s3PutObject } from '@sisu-ai/tool-aws-s3';
import { createTerminalTool } from '@sisu-ai/tool-terminal';
import { expenseSchema, type Expense } from './schema.js';

const model = openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' });
const storageMode = process.env.STORAGE_MODE || 'local';
const receiptsDir = process.env.RECEIPTS_DIR || path.join(process.cwd(), 'sample');
const processedDir = process.env.RECEIPTS_PROCESSED_DIR || path.join(receiptsDir, 'processed');
const outFile = process.env.OUT_FILE || path.join(process.cwd(), 'expenses.jsonl');
const bucket = process.env.AWS_S3_BUCKET || '';
const prefix = process.env.AWS_S3_PREFIX || '';

const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: true, delete: false, exec: true },
  commands: { allow: ['tee', 'ls', 'cat', 'stat'] },
});

const ALLOWED_CATEGORIES = [
  'Food',
  'Beverage',
  'Dessert',
  'Household',
  'Clothing',
  'Office Supplies',
  'Electronics',
  'Health and Beauty',
  'Other',
] as const;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeCategory(raw: string | undefined | null): string {
  const t = String(raw ?? '').trim();
  if (!t) return 'Other';
  const c = titleCase(t.replace(/[_-]+/g, ' '));
  // If already allowed, keep as-is
  if (ALLOWED_CATEGORIES.includes(c as any)) return c;
  // Try some common synonyms
  const map: Record<string, string> = {
    Electronics: 'Electronics',
    Electronic: 'Electronics',
    Groceries: 'Food',
    Grocery: 'Food',
    Snacks: 'Food',
    Drink: 'Beverage',
    Drinks: 'Beverage',
    Beauty: 'Health and Beauty',
    Healthcare: 'Health and Beauty',
    Office: 'Office Supplies',
  };
  const m = map[c as keyof typeof map];
  return m ?? 'Other';
}

function stripCodeFences(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    // Remove opening fence line (e.g., ```json or ```)
    const nl = t.indexOf('\n');
    if (nl !== -1) t = t.slice(nl + 1);
    // Remove trailing fence if present
    if (t.trimEnd().endsWith('```')) {
      const last = t.lastIndexOf('```');
      if (last !== -1) t = t.slice(0, last);
    }
  }
  return t.trim();
}

function extractFirstJsonObject(s: string): string | null {
  const text = s;
  let start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let prev = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '"' && prev !== '\\') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    prev = ch;
  }
  return null;
}

async function parseReceipt(ctx: Ctx, file: string): Promise<Expense | null> {
  const buf = await fs.readFile(file);
  const b64 = buf.toString('base64');
  const messages: any = [
    { role: 'system', content: `Extract receipt data as JSON with fields vendor, date, items[{item, category, price}], total.\n- Respond with strict JSON only (no markdown fences or commentary).\n- Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}. Choose the closest; otherwise use "Other".\n- Prices may be negative for discounts/returns.\n` },
    { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
      ] },
  ];
  const res: any = await ctx.model.generate(messages, { toolChoice: 'none', signal: ctx.signal });
  const raw = String(res?.message?.content || '').trim();
  try {
    let body = stripCodeFences(raw);
    try {
      const json = JSON.parse(body);
      const parsed = expenseSchema.parse(json);
      // normalize categories post-parse
      parsed.items = parsed.items.map(it => ({ ...it, category: normalizeCategory(it.category) }));
      return parsed;
    } catch {
      const candidate = extractFirstJsonObject(body) ?? extractFirstJsonObject(raw);
      if (!candidate) throw new Error('no JSON object found');
      const json = JSON.parse(candidate);
      const parsed = expenseSchema.parse(json);
      parsed.items = parsed.items.map(it => ({ ...it, category: normalizeCategory(it.category) }));
      return parsed;
    }
  } catch (e) {
    console.error('parse failed', e);
    return null;
  }
}

async function saveExpense(exp: Expense) {
  const content = JSON.stringify(exp);
  if (storageMode === 's3') {
    await s3PutObject.handler({ bucket, key: `${prefix}${exp.date}-${exp.vendor}.json`, content }, ctx);
  } else {
    await terminal.run_command({ command: `tee -a ${outFile}`, stdin: content + '\n' });
  }
}

function summarize(expenses: Expense[]) {
  const sums: Record<string, number> = {};
  for (const e of expenses) {
    for (const it of e.items) {
      const cat = normalizeCategory(it.category);
      sums[cat] = (sums[cat] || 0) + it.price;
    }
  }
  return sums;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function moveFileUnique(src: string, dstDir: string): Promise<string> {
  await ensureDir(dstDir);
  const base = path.basename(src);
  const ext = path.extname(base);
  const name = base.slice(0, base.length - ext.length);
  let candidate = path.join(dstDir, base);
  try {
    await fs.rename(src, candidate);
    return candidate;
  } catch (e: any) {
    if (e && e.code !== 'EEXIST') {
      // Try with timestamp suffix to avoid collisions
      const alt = path.join(dstDir, `${name}-${Date.now()}${ext}`);
      await fs.rename(src, alt);
      return alt;
    }
    throw e;
  }
}

async function runOnce(ctx: Ctx) {
  const files = await fs.readdir(receiptsDir);
  const processed: Expense[] = [];
  // Add a lightweight trace-friendly message
  ctx.messages.push({ role: 'user', content: `Process ${files.length} receipts in ${receiptsDir}` });
  for (const f of files) {
    const full = path.join(receiptsDir, f);
    if (!/\.(png|jpg|jpeg)$/i.test(f)) continue;
    const exp = await parseReceipt(ctx, full);
    if (exp) {
      await saveExpense(exp);
      processed.push(exp);
      try {
        const moved = await moveFileUnique(full, processedDir);
        ctx.log.info?.('moved processed receipt', { from: full, to: moved });
      } catch (e) {
        ctx.log.warn?.('failed to move processed receipt', { file: full, error: String((e as any)?.message ?? e) });
      }
    }
  }
  const summary = summarize(processed);
  if (storageMode === 's3') {
    await s3PutObject.handler({ bucket, key: `${prefix}summary.json`, content: JSON.stringify(summary) }, ctx);
  } else {
    await terminal.run_command({ command: `tee ${path.join(receiptsDir, 'summary.json')}`, stdin: JSON.stringify(summary, null, 2) });
  }
  ctx.messages.push({ role: 'assistant', content: `Processed ${processed.length} receipts. Categories: ${Object.keys(summary).join(', ')}` });
}

const ctx: Ctx = {
  input: '',
  messages: [],
  model,
  tools: { list: () => [], get: () => undefined, register: () => {} },
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: { s3: { allowWrite: storageMode === 's3' } },
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); }))
  .use(traceViewer())
  .use(usageTracker({ '*': { inputPer1M: 0.15, outputPer1M: 0.60 } }, { logPerCall: true }))
  .use(async (c, next) => { await runOnce(c); await next(); });

await app.handler()(ctx);

const interval = Number(process.env.INTERVAL_MS || 0);
if (interval > 0) setInterval(() => runOnce(ctx).catch(e => console.error(e)), interval);
