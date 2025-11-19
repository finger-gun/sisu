import 'dotenv/config';
import { Agent, createCtx, type Ctx } from '@sisu-ai/core';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';

// Configuration with better defaults
const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
const baseUrl = process.env.OPENAI_BASE_URL || process.env.BASE_URL || undefined;
const model = process.env.MODEL || process.env.OPENAI_MODEL || 'gpt-4o';

// Check if we have required configuration
if (!apiKey) {
  console.error('❌ Error: Missing API key.');
  console.error('Please set OPENAI_API_KEY or API_KEY environment variable.');
  console.error('\nFor OpenRouter (ChatGPT 5.1):');
  console.error('  export OPENAI_API_KEY=sk-or-v1-xxx');
  console.error('  export OPENAI_BASE_URL=https://openrouter.ai/api/v1');
  console.error('  export OPENAI_MODEL=openai/gpt-5.1');
  process.exit(1);
}

const ctx = createCtx({
  model: openAIAdapter({ 
    model,
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
  }),
  input: 'How many times does the letter "r" appear in the word "strawberry"? Think step by step.',
  systemPrompt: 'You are a helpful assistant that thinks carefully and shows your reasoning process.',
  logLevel: (process.env.LOG_LEVEL as any) ?? 'info',
});

// Middleware to convert input to user message
const inputToMessage = async (c: Ctx, next: () => Promise<void>) => {
  if (c.input) {
    c.messages.push({ role: 'user', content: c.input });
  }
  await next();
};

// First reasoning turn - enable reasoning for complex problem
const reasoningTurn = async (c: Ctx, next: () => Promise<void>) => {
  console.log('🧠 Starting reasoning with:', c.input);
  console.log('Model:', c.model.name);
  console.log('Base URL:', baseUrl || 'default OpenAI');
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'none');
  
  const res: any = await c.model.generate(c.messages, {
    reasoning: true, // Enable reasoning for thinking models
    temperature: 0.1,
    signal: c.signal,
  });
  
  if (res?.message) {
    c.messages.push(res.message);
    console.log('\\n💭 Assistant (with reasoning):', res.message.content);
    
    // Show reasoning details if available (but don't log full details for privacy)
    if (res.message.reasoning_details) {
      console.log('🔍 Reasoning details captured:', Object.keys(res.message.reasoning_details || {}));
      console.log('📝 This response includes reasoning context that will be preserved for follow-up questions.');
    } else {
      console.log('ℹ️  No reasoning_details in response (normal for non-reasoning models)');
      console.log('📝 The reasoning parameter was sent but this model may not support extended reasoning.');
    }
  }
  
  await next();
};

// Follow-up question - reasoning context is automatically preserved
const followUpTurn = async (c: Ctx) => {
  const followUpQuestion = 'Are you absolutely sure? Please double-check your counting and show each letter.';
  console.log('\\n👤 Follow-up:', followUpQuestion);
  
  // Add follow-up question
  c.messages.push({ role: 'user', content: followUpQuestion });
  
  // Generate response - reasoning context from previous turn is automatically preserved
  const res: any = await c.model.generate(c.messages, {
    reasoning: true, // Continue with reasoning enabled
    temperature: 0.1,
    signal: c.signal,
  });
  
  if (res?.message) {
    c.messages.push(res.message);
    console.log('\\n💭 Assistant (follow-up with preserved context):', res.message.content);
    
    if (res.message.reasoning_details) {
      console.log('🔍 Updated reasoning details captured:', Object.keys(res.message.reasoning_details || {}));
      console.log('🔄 Follow-up reasoning built on previous reasoning context.');
    } else {
      console.log('ℹ️  No additional reasoning_details in follow-up response.');
    }
  }
};

// Create the agent with middleware pipeline
const app = new Agent()
  .use(async (c, next) => {
    try {
      await next();
    } catch (e: any) {
      c.log.error('Error:', e);
      let errorMessage = 'Sorry, something went wrong.';
      
      if (e?.message?.includes('405 Method Not Allowed')) {
        errorMessage = 'API endpoint error. Please check your base URL configuration.';
      } else if (e?.message?.includes('401') || e?.message?.includes('403')) {
        errorMessage = 'Authentication error. Please check your API key.';
      } else if (e?.message?.includes('404')) {
        errorMessage = 'Model not found. Please check your model name.';
      } else if (e?.message?.includes('Missing OPENAI_API_KEY')) {
        errorMessage = 'Missing API key. Please set OPENAI_API_KEY environment variable.';
      }
      
      c.messages.push({ 
        role: 'assistant', 
        content: errorMessage
      });
    }
  })
  .use(traceViewer())
  .use(usageTracker({ 
    // Reasoning models typically cost more
    'openai/gpt-5.1': { inputPer1M: 3.0, outputPer1M: 15.0 },
    'o1-preview': { inputPer1M: 15.0, outputPer1M: 60.0 },
    'o1-mini': { inputPer1M: 3.0, outputPer1M: 12.0 },
    'o3-mini': { inputPer1M: 1.0, outputPer1M: 4.0 },
    'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
    'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
    '*': { inputPer1M: 2.0, outputPer1M: 10.0 }, // fallback
  }, { logPerCall: true }))
  .use(inputToMessage)
  .use(reasoningTurn)
  .use(followUpTurn);

// Execute the reasoning conversation
await app.handler()(ctx);

console.log('\\n📊 Conversation Summary:');
console.log('Messages exchanged:', ctx.messages.length);
const reasoningTurns = ctx.messages.filter(m => m.role === 'assistant' && (m as any).reasoning_details).length;
console.log('Reasoning turns with reasoning_details:', reasoningTurns);
console.log('Total assistant responses:', ctx.messages.filter(m => m.role === 'assistant').length);

const finalMessage = ctx.messages.filter(m => m.role === 'assistant').pop();
if (finalMessage) {
  console.log('\\n✨ Final Answer:', finalMessage.content);
  if ((finalMessage as any).reasoning_details) {
    console.log('🧠 Final response includes reasoning context');
  }
}