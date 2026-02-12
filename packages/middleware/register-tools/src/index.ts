import type { Middleware, Tool } from "@sisu-ai/core";

/**
 * Options for registerTools middleware
 */
export interface RegisterToolsOptions {
  /**
   * Optional map of tool names to their API aliases.
   * When provided, adapters will send the alias name to the LLM API
   * instead of the tool's actual name. This allows SISU tools to be
   * called by ecosystem-standard names (e.g., 'bash', 'read_file').
   *
   * @example
   * registerTools(terminal.tools, {
   *   aliases: {
   *     'terminalRun': 'bash',
   *     'terminalReadFile': 'read_file'
   *   }
   * })
   */
  aliases?: Record<string, string>;
}

/**
 * Registers tools with the context and optionally maps them to API aliases.
 *
 * @param tools - Array of tools to register
 * @param options - Optional configuration including alias mappings
 *
 * @example
 * // Register without aliases (default behavior)
 * app.use(registerTools(myTools));
 *
 * @example
 * // Register with ecosystem-standard aliases
 * app.use(registerTools(terminal.tools, {
 *   aliases: {
 *     'terminalRun': 'bash',
 *     'terminalReadFile': 'read_file',
 *     'terminalCd': 'cd'
 *   }
 * }));
 */
export const registerTools =
  (tools: Tool[], options?: RegisterToolsOptions): Middleware =>
  async (ctx, next) => {
    // Register all tools in the registry
    for (const t of tools) {
      ctx.log.debug(`Registering tool: ${t.name}`, {
        tool: t.name,
        description: t.description,
      });
      ctx.tools.register(t);
    }

    // Store alias map in context state for adapters to use
    if (options?.aliases && Object.keys(options.aliases).length > 0) {
      const aliasMap = new Map<string, string>(Object.entries(options.aliases));

      // Validate aliases
      for (const [toolName, alias] of aliasMap) {
        const tool = ctx.tools.get(toolName);
        if (!tool) {
          ctx.log.warn(
            `Alias mapping references non-existent tool: ${toolName}`,
          );
        } else {
          ctx.log.debug(
            `Tool alias: ${toolName} → ${alias} (API will see '${alias}')`,
          );
        }
      }

      // Store in context state
      ctx.state.toolAliases = aliasMap;
    }

    await next();
  };
