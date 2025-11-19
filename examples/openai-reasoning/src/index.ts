import 'dotenv/config';
import { Agent, createCtx, type Ctx } from '@sisu-ai/core';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';

const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
const baseUrl = process.env.OPENAI_BASE_URL || process.env.BASE_URL || undefined;
const model = process.env.MODEL || process.env.OPENAI_MODEL || 'gpt-5.1';

console.log('🚀 OpenAI Reasoning Model Example');
console.log('═'.repeat(50));
console.log(`Model: ${model}`);
console.log(`Base URL: ${baseUrl || 'default OpenAI'}`);
console.log(`API Key: ${apiKey ? `${apiKey.substring(0, 8)}...` : '❌ MISSING'}`);
console.log('═'.repeat(50));
console.log();

if (!apiKey) {
  console.error('❌ Error: OPENAI_API_KEY or API_KEY environment variable required');
  console.error('💡 Set it in your .env file or environment');
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
});

// Middleware to convert input to user message
const inputToMessage = async (c: Ctx, next: () => Promise<void>) => {
  if (c.input) {
    c.messages.push({ role: 'user', content: c.input });
  }
  await next();
};

// Helper to display reasoning details in a user-friendly way
const displayReasoningInfo = (reasoningDetails: any) => {
  if (!reasoningDetails) return;
  
  const details = Array.isArray(reasoningDetails) ? reasoningDetails : [reasoningDetails];
  const summary = details.find((d: any) => d?.type === 'reasoning.summary');
  const encrypted = details.filter((d: any) => d?.type === 'reasoning.encrypted');
  
  console.log('\n🧠 Reasoning Details:');
  console.log('─'.repeat(50));
  
  if (summary?.summary) {
    const text = String(summary.summary);
    const preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
    console.log(`📝 Summary (${text.length} chars):`);
    console.log(preview);
  }
  
  if (encrypted.length > 0) {
    console.log(`🔒 Encrypted contexts: ${encrypted.length} preserved for next turn`);
  }
  
  console.log('─'.repeat(50));
};

// First reasoning turn - enable reasoning for complex problem
const reasoningTurn = async (c: Ctx, next: () => Promise<void>) => {
  console.log('\n📍 TURN 1: Initial Reasoning Request');
  console.log('Question:', c.input);
  
  try {
    const res: any = await c.model.generate(c.messages, {
      reasoning: true, // Enable reasoning for thinking models
      temperature: 0.1,
      signal: c.signal,
    });
    
    if (res?.message) {
      c.messages.push(res.message);
      console.log('\n💭 Assistant Response:');
      console.log(res.message.content);
      
      // Show reasoning details if available
      if (res.message.reasoning_details) {
        displayReasoningInfo(res.message.reasoning_details);
        console.log('✅ Reasoning context captured and will be preserved for follow-up');
      } else {
        console.log('\n⚠️  No reasoning_details in response');
        console.log('ℹ️  This is normal for non-reasoning models (gpt-4o, gpt-3.5, etc.)');
        console.log('💡 Try using: o1-preview, o1-mini, or gpt-5.1');
      }
    }
  } catch (error: any) {
    console.error('\n❌ Error during reasoning turn:');
    
    if (error.message?.includes('405') || error.message?.includes('400')) {
      console.error('⚠️  Model may not support the reasoning parameter');
      console.error('💡 Supported models: o1-preview, o1-mini, gpt-5.1 (via OpenRouter)');
      console.error('💡 Check your MODEL environment variable');
    } else if (error.message?.includes('401')) {
      console.error('⚠️  Authentication failed - check your API key');
    } else if (error.message?.includes('429')) {
      console.error('⚠️  Rate limit exceeded - try again in a moment');
    } else {
      console.error('Details:', error.message);
    }
    
    throw error;
  }
  
  await next();
};

// Follow-up question - reasoning context is automatically preserved
const followUpTurn = async (c: Ctx) => {
  const followUpQuestion = 'Are you absolutely sure? Please double-check your counting and show each letter.';
  
  console.log('\n📍 TURN 2: Follow-up Question (with preserved reasoning context)');
  console.log('Question:', followUpQuestion);
  
  // Add follow-up question
  c.messages.push({ role: 'user', content: followUpQuestion });
  
  try {
    // Generate response - reasoning context from previous turn is automatically preserved
    const res: any = await c.model.generate(c.messages, {
      reasoning: true, // Continue with reasoning enabled
      temperature: 0.1,
      signal: c.signal,
    });
    
    if (res?.message) {
      c.messages.push(res.message);
      console.log('\n💭 Assistant Response:');
      console.log(res.message.content);
      
      if (res.message.reasoning_details) {
        displayReasoningInfo(res.message.reasoning_details);
        console.log('🔄 Follow-up reasoning built on previous context');
        console.log('✨ This demonstrates multi-turn reasoning coherence!');
      } else {
        console.log('\nℹ️  No additional reasoning_details in follow-up response');
      }
    }
  } catch (error: any) {
    console.error('\n❌ Error during follow-up turn:', error.message);
    throw error;
  }
};

// Create the agent with middleware pipeline
const app = new Agent()
  .use(traceViewer())
  .use(usageTracker({
    // Reasoning models typically cost more - configure accurate pricing
    'o1-preview': { inputPer1M: 15.0, outputPer1M: 60.0 },
    'o1-mini': { inputPer1M: 3.0, outputPer1M: 12.0 },
    'gpt-5.1': { inputPer1M: 3.0, outputPer1M: 15.0 },
    '*': { inputPer1M: 2.0, outputPer1M: 10.0 }, // fallback for other models
  }, { logPerCall: true }))
  .use(inputToMessage)
  .use(reasoningTurn)
  .use(followUpTurn);

// Execute the reasoning conversation
console.log('\n🏃 Running conversation with reasoning enabled...\n');
await app.handler()(ctx);

console.log('\n' + '═'.repeat(50));
console.log('📊 CONVERSATION SUMMARY');
console.log('═'.repeat(50));

console.log(`Total messages: ${ctx.messages.length}`);
console.log(`User messages: ${ctx.messages.filter(m => m.role === 'user').length}`);
console.log(`Assistant messages: ${ctx.messages.filter(m => m.role === 'assistant').length}`);

const reasoningTurns = ctx.messages.filter(m => m.role === 'assistant' && (m as any).reasoning_details).length;
console.log(`\n🧠 Reasoning turns: ${reasoningTurns}`);

if (reasoningTurns > 0) {
  console.log('✅ Reasoning details successfully captured and preserved');
  console.log('🔄 Multi-turn conversation maintained reasoning context');
} else {
  console.log('⚠️  No reasoning details captured');
  console.log('💡 This model may not support extended reasoning');
}

const finalMessage = ctx.messages.filter(m => m.role === 'assistant').pop();
if (finalMessage) {
  console.log('\n✨ FINAL ANSWER:');
  console.log('─'.repeat(50));
  console.log(finalMessage.content);
  console.log('─'.repeat(50));
  
  if ((finalMessage as any).reasoning_details) {
    console.log('✅ Includes preserved reasoning context for potential continuation');
  }
}

console.log('\n💾 Traces saved to ./traces/ directory');
console.log('🔍 Open trace HTML to see detailed reasoning visualization');
console.log('═'.repeat(50));