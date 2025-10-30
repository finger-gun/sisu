import 'dotenv/config';
import { Agent, createCtx, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { iterativeToolCalling } from '@sisu-ai/mw-tool-calling';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { azureGetBlob, azureListBlobsDetailed } from '@sisu-ai/tool-azure-blob';

const container = process.env.AZURE_CONTAINER || 'test';

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' }),
  input: `Read the latest blob in my container ${container} on Azure Storage.`,
  systemPrompt: 'You are a helpful assistant.',
  logLevel: (process.env.LOG_LEVEL as any) ?? 'info',
});

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer())
  .use(registerTools([azureGetBlob, azureListBlobsDetailed]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(iterativeToolCalling);

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
