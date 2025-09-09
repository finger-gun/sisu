import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { agentRunApi } from '@sisu-ai/mw-agent-run-api';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { cors } from '@sisu-ai/mw-cors';
import { Server } from '@sisu-ai/server';

const model = openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini'});
const basePath = process.env.BASE_PATH || '/api';
const healthPath = process.env.HEALTH_PATH || '/health';
const apiKey = process.env.API_KEY;

const generateOnce = async (c: Ctx) => {
  if (c.input) c.messages.push({ role: 'user', content: c.input });
  const out: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal, stream: true });
  if (out && typeof out[Symbol.asyncIterator] === 'function') {
    for await (const ev of out as AsyncIterable<any>) {
      if (ev?.type === 'assistant_message' && ev.message) {
        c.messages.push(ev.message);
      }
    }
  } else if (out?.message) {
    c.messages.push(out.message);
  }
};
const store = new InMemoryKV();
const runApi = agentRunApi({ runStore: store, basePath, apiKey });
const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(cors({ origin: '*', credentials: true }))
  .use(traceViewer())
  .use(usageTracker({
    '*': { inputPer1M: 0.15, outputPer1M: 0.60 },
  }, { logPerCall: true }))
  .use(runApi)
  .use(generateOnce);

const port = Number(process.env.PORT) || 3000;

const server = new Server(app, {
  logLevel: 'debug',
  port,
  basePath,
  healthPath,
  bannerEndpoints: (runApi as any).bannerEndpoints,
  createCtx: (req, res) => ({
    req,
    res,
    input: '',
    messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
    model,
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: new AbortController().signal,
    log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
  }),
});

server.listen();
