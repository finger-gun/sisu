import 'dotenv/config';
import { Agent, createCtx, type Tool, type Ctx } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { toolCalling /* or iterativeToolCalling */ } from '@sisu-ai/mw-tool-calling';
import { ollamaAdapter } from '@sisu-ai/adapter-ollama';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { z } from 'zod';

// Tool
interface WeatherArgs { city: string }
const weather: Tool<WeatherArgs> = {
  name: 'getWeather',
  description: 'Get weather for a city',
  schema: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ city, tempC: 21, summary: 'Sunny' }),
};

// Ensure: ollama serve; ollama pull llama3.1:latest
const ctx = createCtx({
  model: ollamaAdapter({ model: process.env.MODEL || 'llama3.1' }),
  input: process.argv.slice(2).join(' ') || 'What is the weather in Malmö?',
  systemPrompt: 'You are a helpful assistant.',
});

// Minimal pipeline: no classifier, no switch, no manual loop
const app = new Agent()
  .use(errorBoundary(async (err, c) => {
    c.log.error(err);
    c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' });
  }))
  .use(traceViewer())
  .use(registerTools([weather]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling); // 1) generate(..., auto) → maybe run tools → 2) finalize with none

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
