# Streaming Responses

Real-time token streaming for responsive agents.

## Basic streaming setup

```typescript
import { Agent, createCtx, stdoutStream } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-5.4" }),
  input: "Write a short poem",
  stream: stdoutStream(), // Stream to stdout
});

const app = new Agent().use(inputToMessage).use(async (ctx) => {
  const stream = await ctx.model.generate(ctx.messages, {
    stream: true,
    signal: ctx.signal,
  });

  let fullContent = "";

  for await (const event of stream) {
    if (event.type === "token" && event.delta) {
      fullContent += event.delta;
      await ctx.stream.write(event.delta);
    }
  }

  ctx.messages.push({
    role: "assistant",
    content: fullContent,
  });
});

await app.handler()(ctx);
```

## Custom stream implementation

```typescript
import type { TokenStream } from "@sisu-ai/core";

class CustomStream implements TokenStream {
  async write(token: string): Promise<void> {
    // Send to websocket, SSE, etc.
    websocket.send(
      JSON.stringify({
        type: "token",
        content: token,
      }),
    );
  }

  async close(): Promise<void> {
    websocket.send(JSON.stringify({ type: "done" }));
  }
}

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-5.4" }),
  stream: new CustomStream(),
});
```

## Server-Sent Events (SSE)

```typescript
import { Agent, createCtx } from "@sisu-ai/core";
import type { TokenStream } from "@sisu-ai/core";
import express from "express";

class SSEStream implements TokenStream {
  constructor(private res: express.Response) {
    this.res.setHeader("Content-Type", "text/event-stream");
    this.res.setHeader("Cache-Control", "no-cache");
    this.res.setHeader("Connection", "keep-alive");
  }

  async write(token: string): Promise<void> {
    this.res.write(`data: ${JSON.stringify({ token })}\n\n`);
  }

  async close(): Promise<void> {
    this.res.write("data: [DONE]\n\n");
    this.res.end();
  }
}

const app = express();

app.get("/stream", async (req, res) => {
  const ctx = createCtx({
    model: openAIAdapter({ model: "gpt-5.4" }),
    input: req.query.prompt as string,
    stream: new SSEStream(res),
  });

  const agent = new Agent().use(inputToMessage).use(async (ctx) => {
    const stream = await ctx.model.generate(ctx.messages, {
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "token" && event.delta) {
        await ctx.stream.write(event.delta);
      }
    }

    await ctx.stream.close();
  });

  await agent.handler()(ctx);
});

app.listen(3000);
```

## WebSocket streaming

```typescript
import { WebSocket, WebSocketServer } from "ws";
import type { TokenStream } from "@sisu-ai/core";

class WebSocketStream implements TokenStream {
  constructor(private ws: WebSocket) {}

  async write(token: string): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "token",
          content: token,
        }),
      );
    }
  }

  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "done" }));
    }
  }
}

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws) => {
  ws.on("message", async (data) => {
    const { prompt } = JSON.parse(data.toString());

    const ctx = createCtx({
      model: openAIAdapter({ model: "gpt-5.4" }),
      input: prompt,
      stream: new WebSocketStream(ws),
    });

    const agent = new Agent().use(inputToMessage).use(async (ctx) => {
      const stream = await ctx.model.generate(ctx.messages, {
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === "token" && event.delta) {
          await ctx.stream.write(event.delta);
        }
      }

      await ctx.stream.close();
    });

    await agent.handler()(ctx);
  });
});
```

## Stream event types

```typescript
type ModelEvent =
  | { type: "token"; delta: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; delta: string }
  | { type: "tool_call_end"; id: string; args: object }
  | { type: "done"; message: Message; usage?: TokenUsage };

// Handle all event types
for await (const event of stream) {
  switch (event.type) {
    case "token":
      await ctx.stream.write(event.delta);
      break;
    case "tool_call_start":
      ctx.log.info("Tool call started", { name: event.name });
      break;
    case "done":
      ctx.log.info("Generation complete", { usage: event.usage });
      break;
  }
}
```

## Streaming with tool calls

```typescript
const app = new Agent()
  .use(registerTools([weatherTool]))
  .use(inputToMessage)
  .use(async (ctx) => {
    const stream = await ctx.model.generate(ctx.messages, {
      stream: true,
      tools: ctx.tools.list(),
      toolChoice: "auto",
    });

    let fullContent = "";
    const toolCalls = [];

    for await (const event of stream) {
      switch (event.type) {
        case "token":
          fullContent += event.delta;
          await ctx.stream.write(event.delta);
          break;

        case "tool_call_start":
          await ctx.stream.write(`\n[Calling ${event.name}...]\n`);
          break;

        case "tool_call_end":
          toolCalls.push({
            id: event.id,
            name: event.name,
            args: event.args,
          });
          break;
      }
    }

    // Execute tool calls if any
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        const tool = ctx.tools.get(call.name);
        const result = await tool.handler(call.args, ctx);
        await ctx.stream.write(
          `\n[${call.name} result: ${JSON.stringify(result)}]\n`,
        );
      }
    }

    ctx.messages.push({
      role: "assistant",
      content: fullContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  });
```

## Cancellation with streaming

```typescript
const controller = new AbortController();

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-5.4" }),
  signal: controller.signal,
  stream: stdoutStream(),
});

const app = new Agent().use(inputToMessage).use(async (ctx) => {
  try {
    const stream = await ctx.model.generate(ctx.messages, {
      stream: true,
      signal: ctx.signal,
    });

    for await (const event of stream) {
      if (event.type === "token" && event.delta) {
        await ctx.stream.write(event.delta);
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      await ctx.stream.write("\n[Cancelled]");
    }
    throw err;
  }
});
```

## Best practices

1. **Always propagate signal** to stream operations
2. **Handle backpressure** in custom streams
3. **Close streams** even on errors
4. **Buffer small tokens** to reduce network calls
5. **Send keepalive** for long operations
6. **Validate event types** before processing
7. **Test cancellation** behavior

## Common mistakes

### ❌ Not closing the stream

```typescript
// WRONG
for await (const event of stream) {
  await ctx.stream.write(event.delta);
}
// Missing close!

// CORRECT
try {
  for await (const event of stream) {
    await ctx.stream.write(event.delta);
  }
} finally {
  await ctx.stream.close();
}
```

### ❌ Blocking the event loop

```typescript
// WRONG - synchronous write blocks
for await (const event of stream) {
  fs.writeFileSync("output.txt", event.delta, { flag: "a" });
}

// CORRECT - async write
for await (const event of stream) {
  await fs.promises.appendFile("output.txt", event.delta);
}
```

### ❌ Not handling stream errors

```typescript
// WRONG
const stream = await ctx.model.generate(ctx.messages, { stream: true });

// CORRECT
try {
  const stream = await ctx.model.generate(ctx.messages, { stream: true });
  for await (const event of stream) {
    // ...
  }
} catch (err) {
  ctx.log.error("Stream error", err);
  await ctx.stream.write("\n[Error occurred]");
  throw err;
}
```

## External docs

- [Stream example](https://github.com/finger-gun/sisu/tree/main/examples/openai-stream)
- [Server example](https://github.com/finger-gun/sisu/tree/main/examples/openai-server)
- [Core types](https://github.com/finger-gun/sisu/tree/main/packages/core)
