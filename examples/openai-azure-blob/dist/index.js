import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import createAzureBlobTools from '@sisu-ai/tool-azure-blob';
const model = openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' });
const container = process.env.AZURE_CONTAINER || 'test';
const ctx = {
    input: `List blobs in container ${container}.`,
    messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
    model,
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: new AbortController().signal,
    log: createConsoleLogger({ level: process.env.LOG_LEVEL ?? 'info' }),
};
const tools = Object.values(createAzureBlobTools());
const app = new Agent()
    .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
    .use(traceViewer())
    .use(registerTools(tools))
    .use(inputToMessage)
    .use(conversationBuffer({ window: 6 }))
    .use(toolCalling);
await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
