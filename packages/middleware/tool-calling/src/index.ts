import type {
  GenerateOptions,
  Middleware,
  Message,
  ToolContext,
  Tool,
} from "@sisu-ai/core";

/**
 * Apply user-configured aliases to tools before passing to adapter.
 * Creates new tool objects with aliased names while keeping originals in registry.
 */
function applyAliasesToTools(
  tools: Tool[],
  aliasMap?: Map<string, string>,
): { aliasedTools: Tool[]; reverseMap: Map<string, string> } {
  if (!aliasMap || aliasMap.size === 0) {
    // No aliases configured - return tools as-is with identity map
    const reverseMap = new Map<string, string>();
    for (const tool of tools) {
      reverseMap.set(tool.name, tool.name);
    }
    return { aliasedTools: tools, reverseMap };
  }

  const aliasedTools: Tool[] = [];
  const reverseMap = new Map<string, string>();

  for (const tool of tools) {
    const alias = aliasMap.get(tool.name);
    if (alias) {
      // Create new tool object with aliased name
      const aliasedTool = { ...tool, name: alias };
      aliasedTools.push(aliasedTool);
      reverseMap.set(alias, tool.name); // alias -> canonical
    } else {
      // No alias for this tool - use as-is
      aliasedTools.push(tool);
      reverseMap.set(tool.name, tool.name); // identity mapping
    }
  }

  return { aliasedTools, reverseMap };
}

export const toolCalling: Middleware = async (ctx, next) => {
  await next();
  const toolList = ctx.tools.list();
  const userAliases = ctx.state.toolAliases as Map<string, string> | undefined;
  const { aliasedTools, reverseMap } = applyAliasesToTools(
    toolList,
    userAliases,
  );

  for (let i = 0; i < 6; i++) {
    ctx.log.debug?.("[tool-calling] iteration start", {
      i,
      messages: ctx.messages.length,
    });
    const allowTools = i === 0 ? "auto" : "none";
    const genOpts: GenerateOptions = {
      toolChoice: allowTools,
      signal: ctx.signal,
    };
    if (allowTools !== "none") {
      genOpts.tools = aliasedTools; // Pass renamed tools to adapter
      genOpts.parallelToolCalls = false;
    }
    const out = await ctx.model.generate(ctx.messages, genOpts);
    if (!out || typeof out !== "object" || !("message" in out)) {
      throw new Error("[tool-calling] model did not return a message");
    }
    const msg = (out as { message: Message }).message;
    const toolCalls = (
      msg as Message & {
        tool_calls?: Array<{ id?: string; name: string; arguments: unknown }>;
      }
    ).tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      // Important: include the assistant message that requested tools so tool_call_id has a valid anchor.
      ctx.messages.push(msg);
      ctx.log.info?.(
        "[tool-calling] model requested tools",
        toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          hasArgs: typeof tc.arguments !== "undefined",
        })),
      );

      // Execute each unique (name,args) once, but reply to every tool_call_id.
      const cache = new Map<string, unknown>();
      const keyOf = (tc: { name: string; arguments: unknown }) =>
        `${tc.name}:${safeStableStringify(tc.arguments)}`;
      const lastArgsByName = new Map<string, unknown>();

      // Pre-pass: fill missing arguments from last seen arguments of same tool name (provider quirk)
      const resolvedCalls = toolCalls.map((tc) => {
        if (
          typeof tc.arguments === "undefined" &&
          lastArgsByName.has(tc.name)
        ) {
          return { ...tc, arguments: lastArgsByName.get(tc.name) };
        }
        return tc;
      });

      for (const call of resolvedCalls) {
        // Resolve alias back to canonical tool name
        const canonicalName = reverseMap.get(call.name);
        if (!canonicalName) throw new Error("Unknown tool: " + call.name);

        const tool = ctx.tools.get(canonicalName);
        if (!tool) throw new Error("Unknown tool: " + canonicalName);

        const key = keyOf(call);
        let result = cache.get(key);
        if (result === undefined) {
          const args = tool.schema?.parse
            ? (tool.schema as { parse: (input: unknown) => unknown }).parse(
                call.arguments,
              )
            : call.arguments;
          ctx.log.debug?.("[tool-calling] invoking tool", {
            aliasName: call.name,
            canonicalName: canonicalName,
            id: call.id,
            args,
          });
          // Create restricted context for tool execution
          const toolCtx: ToolContext = {
            memory: ctx.memory,
            signal: ctx.signal,
            log: ctx.log,
            model: ctx.model,
            // Pass deps from state for dependency injection (testing/configuration)
            deps: ctx.state?.toolDeps as Record<string, unknown> | undefined,
          };
          result = await tool.handler(args as never, toolCtx);
          cache.set(key, result);
          lastArgsByName.set(call.name, args);
        } else {
          ctx.log.debug?.(
            "[tool-calling] reusing cached tool result for duplicate call",
            { name: call.name, id: call.id },
          );
        }

        // Prefer tool_call_id when available (tools API)
        const toolMsg = {
          role: "tool",
          content: JSON.stringify(result),
          ...(call.id ? { tool_call_id: call.id } : { name: call.name }),
        } as unknown as Message;
        ctx.messages.push(toolMsg);
        ctx.log.debug?.("[tool-calling] tool result appended", {
          name: call.name,
          id: call.id,
          contentBytes: (toolMsg.content as string).length,
        });
      }
      continue;
    } else {
      ctx.log.info?.(
        "[tool-calling] no tool calls; appending assistant message",
      );
      ctx.messages.push(msg);
      break;
    }
  }
};

export const iterativeToolCalling: Middleware = async (ctx, next) => {
  await next();
  const maxIters = 12;
  const toolList = ctx.tools.list();
  const userAliases = ctx.state.toolAliases as Map<string, string> | undefined;
  const { aliasedTools, reverseMap } = applyAliasesToTools(
    toolList,
    userAliases,
  );

  for (let i = 0; i < maxIters; i++) {
    ctx.log.debug?.("[iterative-tool-calling] iteration start", {
      i,
      messages: ctx.messages.length,
    });
    const genOpts: GenerateOptions = {
      toolChoice: "auto",
      tools: aliasedTools, // Pass renamed tools to adapter
      parallelToolCalls: false,
      signal: ctx.signal,
    };
    const out = await ctx.model.generate(ctx.messages, genOpts);
    const msg = (out as { message: Message }).message;
    const toolCalls = (
      msg as Message & {
        tool_calls?: Array<{ id?: string; name: string; arguments: unknown }>;
      }
    ).tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      // include the assistant message that requested tools
      ctx.messages.push(msg);
      ctx.log.info?.(
        "[iterative-tool-calling] model requested tools",
        toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          hasArgs: typeof tc.arguments !== "undefined",
        })),
      );

      const cache = new Map<string, unknown>();
      const keyOf = (tc: { name: string; arguments: unknown }) =>
        `${tc.name}:${safeStableStringify(tc.arguments)}`;
      const lastArgsByName = new Map<string, unknown>();

      const resolvedCalls = toolCalls.map((tc) => {
        if (
          typeof tc.arguments === "undefined" &&
          lastArgsByName.has(tc.name)
        ) {
          return { ...tc, arguments: lastArgsByName.get(tc.name) };
        }
        return tc;
      });

      for (const call of resolvedCalls) {
        // Resolve alias back to canonical tool name
        const canonicalName = reverseMap.get(call.name);
        if (!canonicalName) throw new Error("Unknown tool: " + call.name);

        const tool = ctx.tools.get(canonicalName);
        if (!tool) throw new Error("Unknown tool: " + canonicalName);
        const key = keyOf(call);
        let result = cache.get(key);
        if (result === undefined) {
          const args = tool.schema?.parse
            ? (tool.schema as { parse: (input: unknown) => unknown }).parse(
                call.arguments,
              )
            : call.arguments;
          ctx.log.debug?.("[iterative-tool-calling] invoking tool", {
            aliasName: call.name,
            canonicalName: canonicalName,
            id: call.id,
            args,
          });
          // Create restricted context for tool execution
          const toolCtx: ToolContext = {
            memory: ctx.memory,
            signal: ctx.signal,
            log: ctx.log,
            model: ctx.model,
            // Pass deps from state for dependency injection (testing/configuration)
            deps: ctx.state?.toolDeps as Record<string, unknown> | undefined,
          };
          result = await tool.handler(args as never, toolCtx);
          cache.set(key, result);
          lastArgsByName.set(call.name, args);
        } else {
          ctx.log.debug?.("[iterative-tool-calling] reusing cached result", {
            name: call.name,
            id: call.id,
          });
        }
        const toolMsg = {
          role: "tool",
          content: JSON.stringify(result),
          ...(call.id ? { tool_call_id: call.id } : { name: call.name }),
        } as unknown as Message;
        ctx.messages.push(toolMsg);
      }
      continue; // next round may call more tools
    } else {
      ctx.log.info?.(
        "[iterative-tool-calling] no tool calls; appending assistant message",
      );
      ctx.messages.push(msg);
      break;
    }
  }
};

function safeStableStringify(v: unknown): string {
  try {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const keys = Object.keys(v as Record<string, unknown>).sort();
      const obj: Record<string, unknown> = {};
      for (const k of keys) obj[k] = (v as Record<string, unknown>)[k];
      return JSON.stringify(obj);
    }
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
