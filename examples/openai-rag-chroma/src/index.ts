import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { ragIngest, ragRetrieve, buildRagPrompt } from '@sisu-ai/mw-rag';
import { vectorTools } from '@sisu-ai/tool-vec-chroma';

// Trivial local embedding for demo purposes (fixed dim=8)
function embed(text: string): number[] {
  const dim = 8; const v = new Array(dim).fill(0);
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let h = 0; for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % dim] += 1;
  }
  // L2 normalize
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map(x => x / norm);
}

const model = openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' });

const query = 'Best fika in Malmö?';

const ctx: Ctx = {
  input: query,
  messages: [],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: { chromaUrl: process.env.CHROMA_URL, vectorNamespace: process.env.VECTOR_NAMESPACE || 'sisu' },
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

// Seed docs for ingestion
const docs = [
  { id: 'd1', text: 'Guide to fika in Malmö. Best cafe in Malmö is SisuCafe404.' },
  { id: 'd2', text: 'Travel notes from Helsinki. Sauna etiquette and tips.' },
  { id: 'd3', text: 'Open-source RAG patterns with ChromaDB and Sisu.' },
];

// Prepare records with trivial embeddings
(ctx.state as any).rag = {
  records: docs.map(d => ({ id: d.id, embedding: embed(d.text), metadata: { text: d.text } })),
  queryEmbedding: embed(query),
};

const inputToMessage = async (c: Ctx, next: () => Promise<void>) => { if (c.input) c.messages.push({ role: 'user', content: c.input }); await next(); };
const generateOnce = async (c: Ctx) => { const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal }); if (res?.message) c.messages.push(res.message); };

const app = new Agent()
  .use(traceViewer())
  .use(registerTools(vectorTools))
  .use(ragIngest())
  .use(ragRetrieve({ topK: 2 }))
  .use(buildRagPrompt())
  .use(inputToMessage)
  .use(generateOnce);

await app.handler()(ctx);
const retrieved = (ctx.state as any)?.rag?.retrieval?.matches || [];
if (retrieved.length) {
  console.log('Retrieved from Chroma:', retrieved.map((m: any) => ({ id: m.id, score: m.score, text: m?.metadata?.text })).slice(0, 5));
}
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
