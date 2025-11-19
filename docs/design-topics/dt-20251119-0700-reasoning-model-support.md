# Reasoning Model Support Design

## Implementation Status: ✅ COMPLETED

**Date Completed:** November 19, 2025
**Implementation:** Full reasoning model support added to Sisu framework

## Problem Statement (RESOLVED)

Previously, the Sisu framework did not properly support reasoning models like OpenAI's o1/o3 series or ChatGPT 5.1. These models provide extended thinking capabilities through a `reasoning` parameter and return `reasoning_details` in the response that must be preserved in conversation history.

**✅ Solution Implemented:** Full reasoning model support with backward compatibility.

### Example Usage Pattern (OpenRouter with ChatGPT 5.1)

```typescript
// First API call with reasoning enabled
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    "model": "openai/gpt-5.1",
    "messages": [
      {
        "role": "user",
        "content": "How many r's are in the word 'strawberry'?"
      }
    ],
    "reasoning": {"enabled": true}
  })
});

const result = await response.json();
const assistantMessage = result.choices[0].message;

// Second API call - preserve reasoning_details
const messages = [
  {
    role: 'user',
    content: "How many r's are in the word 'strawberry'?",
  },
  {
    role: 'assistant',
    content: assistantMessage.content,
    reasoning_details: assistantMessage.reasoning_details, // CRITICAL: Must pass back unmodified
  },
  {
    role: 'user',
    content: "Are you sure? Think carefully.",
  },
];

const response2 = await fetch(/* ... */, {
  body: JSON.stringify({
    "model": "openai/gpt-5.1",
    "messages": messages  // Includes preserved reasoning_details
  })
});
```

## Implemented Solution

### 1. Core Types (`packages/core/src/types.ts`) ✅

**Added:**
- ✅ `reasoning_details?: unknown` field in [`AssistantMessage`](packages/core/src/types.ts:29)
- ✅ `reasoning` parameter in [`GenerateOptions`](packages/core/src/types.ts:54)

**Implemented definition:**
```typescript
export interface AssistantMessage {
  role: 'assistant';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  /** 
   * Reasoning details from thinking/reasoning models (e.g., o1, o3, ChatGPT 5.1).
   * This field must be preserved when passing the message back to the model 
   * for multi-turn conversations to maintain reasoning context.
   * @internal The structure is provider-specific and should be treated as opaque.
   */
  reasoning_details?: unknown;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  toolChoice?: ToolChoice;
  signal?: AbortSignal;
  tools?: Tool[];
  parallelToolCalls?: boolean;
  stream?: boolean;
  /**
   * Enable extended reasoning/thinking for models that support it (e.g., o1, o3, ChatGPT 5.1).
   * - `true` or `false`: Simple enable/disable
   * - `{ enabled: true }`: OpenAI-style object notation
   * - Custom object: Provider-specific options
   */
  reasoning?: boolean | { enabled: boolean } | Record<string, unknown>;
}
```

### 2. OpenAI Adapter (`packages/adapters/openai/src/index.ts`) ✅

**Fixed:**
1. ✅ Request body includes reasoning parameter when provided
2. ✅ Response parsing captures reasoning_details from API
3. ✅ Message conversion preserves reasoning_details in conversations
4. ✅ Streaming mode handles reasoning_details in final message

**Implemented flow:**
- ✅ `normalizeReasoning()` helper converts boolean to object format
- ✅ Request includes reasoning parameter when provided
- ✅ Response parsing extracts reasoning_details
- ✅ `toOpenAiMessage()` preserves reasoning_details in conversation history
- ✅ Streaming mode captures reasoning_details in assistant message event

### 3. Other Adapters

**Anthropic:** Does not support reasoning models (proprietary to OpenAI)
**Ollama:** Could support if using OpenAI-compatible reasoning models

## Implementation Details

### Core Implementation

The reasoning model support is fully implemented with the following key components:

#### 1. Type Definitions

```typescript
// packages/core/src/types.ts - IMPLEMENTED ✅

export interface AssistantMessage {
  role: 'assistant';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  /** 
   * Reasoning details from thinking/reasoning models (e.g., o1, o3, ChatGPT 5.1).
   * This field must be preserved when passing the message back to the model 
   * for multi-turn conversations to maintain reasoning context.
   * @internal The structure is provider-specific and should be treated as opaque.
   */
  reasoning_details?: unknown;
}

export interface GenerateOptions {
  // ... existing fields ...
  /**
   * Enable extended reasoning/thinking for models that support it (e.g., o1, o3, ChatGPT 5.1).
   * - `true` or `false`: Simple enable/disable
   * - `{ enabled: true }`: OpenAI-style object notation
   * - Custom object: Provider-specific options
   */
  reasoning?: boolean | { enabled: boolean } | Record<string, unknown>;
}
```

#### 2. OpenAI Adapter Implementation

```typescript
// packages/adapters/openai/src/index.ts - IMPLEMENTED ✅

// Normalization helper
function normalizeReasoning(reasoning: GenerateOptions['reasoning']): unknown {
  if (reasoning === undefined) return undefined;
  if (typeof reasoning === 'boolean') {
    return { enabled: reasoning };
  }
  // Pass through objects as-is
  return reasoning;
}

// Request generation includes reasoning parameter
const reasoningParam = normalizeReasoning(genOpts?.reasoning);
if (reasoningParam !== undefined) {
  body.reasoning = reasoningParam;
}

// Response parsing captures reasoning_details
const msgShape = (choice?.message ?? {}) as OpenAIMessageShape;
if (msgShape.reasoning_details !== undefined) {
  msg.reasoning_details = msgShape.reasoning_details;
}

// Message conversion preserves reasoning_details
if (anyM.reasoning_details !== undefined) {
  result.reasoning_details = anyM.reasoning_details;
}
```

#### 3. Streaming Support

Streaming mode correctly handles reasoning_details in the final assistant message:

```typescript
// IMPLEMENTED ✅
let reasoningDetails: unknown = undefined;
// ... processing stream chunks ...
const msgShape = (j?.choices?.[0] as any)?.message as OpenAIMessageShape | undefined;
if (msgShape?.reasoning_details !== undefined) {
  reasoningDetails = msgShape.reasoning_details;
}
// ... end of stream ...
const finalMessage: AssistantMessage = { role: 'assistant', content: full };
if (reasoningDetails !== undefined) {
  finalMessage.reasoning_details = reasoningDetails;
}
  
  // ... existing logic ...
  
  if (m.role === 'assistant') {
    const anyM = m as Message & { 
      tool_calls?: Array<{ id?: string; name?: string; arguments?: unknown }>; 
      reasoning_details?: unknown;  // NEW
    };
    
    return {
      ...base,
      content: (toolCalls && (!hasTextOrImages(parts) && (m.content === undefined || m.content === ''))) 
        ? null 
        : (parts ?? m.content ?? ''),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
      // NEW: Preserve reasoning_details
      ...(anyM.reasoning_details !== undefined ? { reasoning_details: anyM.reasoning_details } : {}),
    };
  }
  
  // ... rest of function ...
}
```

#### 2.4 Type Updates

```typescript
// Update OpenAIMessageShape type (around line 7-12)
type OpenAIMessageShape = {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
  function_call?: { name: string; arguments: string };
  reasoning_details?: unknown;  // NEW
};

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: Array<{ id?: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  reasoning_details?: unknown;  // NEW
};
```

### Phase 3: Streaming Support

Reasoning models may stream reasoning tokens differently:

```typescript
// Update streaming logic to handle reasoning events
type OpenAIStreamChunk = { 
  choices?: Array<{ 
    delta?: { 
      content?: string;
      reasoning_content?: string;  // NEW: Some models stream reasoning separately
    } 
  }> 
};

// In streaming generator (around line 109-114)
const j = JSON.parse(data) as OpenAIStreamChunk;
const delta = j?.choices?.[0]?.delta;
const token = delta?.content;
const reasoningToken = delta?.reasoning_content;

if (typeof token === 'string') {
  full += token;
  yield { type: 'token', token } as ModelEvent;
}
// Could add reasoning_token event type if needed
```

### Phase 4: Testing Strategy

#### Unit Tests
```typescript
// packages/adapters/openai/test/openai.test.ts

test('openAIAdapter handles reasoning parameter in request', async () => {
  process.env.OPENAI_API_KEY = 'test';
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url, init) => {
    const req = JSON.parse((init as any).body);
    expect(req.reasoning).toEqual({ enabled: true });
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [{ message: { role: 'assistant', content: '3', reasoning_details: { /* ... */ } } }]
      })
    } as any;
  });
  
  const llm = openAIAdapter({ model: 'gpt-5.1' });
  const out = await llm.generate([{ role: 'user', content: 'test' }], { reasoning: true });
  
  expect(out.message.reasoning_details).toBeDefined();
});

test('openAIAdapter preserves reasoning_details in conversation', async () => {
  process.env.OPENAI_API_KEY = 'test';
  const reasoning_details = { thinking_time: 5.2, steps: ['step1', 'step2'] };
  
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url, init) => {
    const req = JSON.parse((init as any).body);
    const assistantMsg = req.messages.find((m: any) => m.role === 'assistant');
    
    // Verify reasoning_details was preserved in the request
    expect(assistantMsg?.reasoning_details).toEqual(reasoning_details);
    
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'response' } }]
      })
    } as any;
  });
  
  const llm = openAIAdapter({ model: 'gpt-5.1' });
  const messages: Message[] = [
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'answer', reasoning_details } as any,
    { role: 'user', content: 'follow up' },
  ];
  
  await llm.generate(messages);
  expect(fetchMock).toHaveBeenCalled();
});
```

### Testing Results ✅

**12/12 tests passing** including:

- ✅ Request includes reasoning parameter (boolean and object formats)
- ✅ Response captures reasoning_details from API
- ✅ Multi-turn conversation preserves reasoning context 
- ✅ Backward compatibility maintained (existing tests pass)
- ✅ Streaming mode handles reasoning_details correctly

## Implementation Checklist ✅ COMPLETED

- [x] Update [`AssistantMessage`](packages/core/src/types.ts:29) with `reasoning_details?: unknown`
- [x] Update [`GenerateOptions`](packages/core/src/types.ts:54) with `reasoning?: boolean | { enabled: boolean } | Record<string, unknown>`
- [x] Add `normalizeReasoning()` helper function to OpenAI adapter
- [x] Update OpenAI request body to include reasoning parameter
- [x] Update OpenAI response parsing to capture reasoning_details
- [x] Update [`toOpenAiMessage()`](packages/adapters/openai/src/index.ts:219) to preserve reasoning_details
- [x] Update type definitions (`OpenAIMessageShape`, `OpenAIChatMessage`)
- [x] Add comprehensive unit tests for reasoning functionality (6 new tests)
- [x] Create example usage in `/examples` directory
- [x] Update OpenAI adapter README with reasoning documentation
- [x] Streaming mode support implemented and tested

## Usage Example ✅

```typescript
import { openAIAdapter } from '@sisu-ai/adapter-openai';

const llm = openAIAdapter({ model: 'gpt-5.1' });

// Enable reasoning
const response = await llm.generate(
  [{ role: 'user', content: 'Complex reasoning task' }],
  { reasoning: true }
);

// Multi-turn with preserved reasoning context
const messages = [
  { role: 'user', content: 'Initial question' },
  response.message, // Contains reasoning_details
  { role: 'user', content: 'Follow-up' },
];

const followUp = await llm.generate(messages, { reasoning: true });
```

## Migration Impact ✅

**Breaking Changes:** None - all additions are optional fields

**Backward Compatibility:** ✅ Confirmed
- Existing code continues to work without changes
- `reasoning_details` is optional and ignored if not present
- `reasoning` parameter is optional in `GenerateOptions`
- All existing tests continue to pass

## References

- ✅ Implementation Story: `docs/stories/reasoning-model-support.md`
- ✅ Example Code: `examples/reasoning-model.ts`
- ✅ OpenAI Adapter Documentation: `packages/adapters/openai/README.md`
- OpenRouter ChatGPT 5.1 docs: https://openrouter.ai/docs
- OpenAI o1/o3 series documentation