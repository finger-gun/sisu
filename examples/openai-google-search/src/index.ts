import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { googleSearch } from '@sisu-ai/tool-web-search-google';
import { webFetch } from '@sisu-ai/tool-web-fetch';
import { summarizeText } from '@sisu-ai/tool-summarize-text';

const model = openAIAdapter({ model: 'gpt-4o-mini' });

const userInput = process.argv.filter(a => !a.startsWith('--')).slice(2).join(' ')
  || 'Find the latest NASA mission news from at least 3 different domains. Summarize each item with a one-line bullet and cite the URL. If pages are long, use summarizeText.';

const ctx: Ctx = {
  input: userInput,
  messages: [{ role: 'system', content: 'You can search the web with googleSearch, fetch pages with webFetch, and condense with summarizeText.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer())
  .use(registerTools([googleSearch, webFetch, summarizeText]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 10 }))
  .use(toolCalling);

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);

