import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { agentRunApi } from '@sisu-ai/mw-agent-run-api';
import { Server } from '@sisu-ai/server';

const model = openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' });

const generateOnce = async (c: Ctx) => {
  if (c.input) c.messages.push({ role: 'user', content: c.input });
  console.log(c);
  const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push(res.message);
};
const store = new InMemoryKV();
const app = new Agent()
  .use(agentRunApi({ runStore: store }))
  .use(generateOnce);

const port = Number(process.env.PORT) || 3000;

const server = new Server(app, {
  port,
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

server.listen(() => {
  console.log(`listening on http://localhost:${port}`);
});
