# @sisu-ai/tool-terminal

## 7.1.0

### Minor Changes

- Enhanced terminal tool to return detailed policy information when file reads are denied. The tool now includes denial messages and allowed command patterns in the response, making it easier for agents to understand permission constraints and adjust their behavior accordingly.

## 7.0.1

### Patch Changes

- Infrastructure migration to pnpm + Turbo and tool aliasing support

  **Infrastructure Updates:**
  - Migrated from npm to pnpm for faster, more efficient dependency management
  - Added Turbo for optimized monorepo builds with caching
  - Updated all package dependencies and peer dependencies

  **New Feature:**
  - Added optional tool aliasing support in `registerTools` middleware - map SISU tool names to ecosystem-standard aliases (e.g., 'bash', 'read_file')

  **Example Usage:**

  ```typescript
  registerTools(terminal.tools, {
    aliases: {
      terminalRun: "bash",
      terminalReadFile: "read_file",
    },
  });
  ```

  **Maintenance:**
  - Code formatting standardization across packages
  - Internal improvements to tool-calling middleware

- Updated dependencies
  - @sisu-ai/core@2.3.1

## 7.0.0

### Patch Changes

- chore: Update peer dependencies to use caret ranges

  Changed all peer dependencies from exact versions to caret ranges (e.g., `"2.2.1"` → `"^2.2.1"`).

  **Benefits:**
  - Prevents unnecessary major version bumps when core package receives minor/patch updates
  - Follows semantic versioning best practices
  - Aligns with standard npm ecosystem conventions
  - Reduces version number inflation across the monorepo

  **Technical Details:**
  - `^2.2.1` accepts any version ≥2.2.1 and <3.0.0 (backwards compatible updates)
  - Only breaking changes (major version bumps) will now trigger major bumps in dependent packages
  - No runtime behavior changes - this is purely a metadata update

  This is a non-breaking change that improves the maintainability of the monorepo.

- Updated dependencies
  - @sisu-ai/core@2.3.0

## 6.0.1

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@2.2.1

## 6.0.0

### Patch Changes

- Updated dependencies [7f0e07e]
  - @sisu-ai/core@2.2.0

## 5.0.0

### Patch Changes

- Updated dependencies [4c5a27a]
  - @sisu-ai/core@2.1.0

## 4.0.1

### Patch Changes

- Updated dependencies [bacf245]
  - @sisu-ai/core@2.0.1

## 4.0.0

### Patch Changes

- de89201: Implement tool handler sandboxing with restricted ToolContext

  **Security Enhancement:**
  Tool handlers now receive a sandboxed `ToolContext` instead of full `Ctx`, preventing:
  - Tools from calling other tools (no `tools` registry access)
  - Tools from manipulating conversation history (no `messages` access)
  - Tools from accessing middleware state (no `state` access)
  - Tools from interfering with user I/O (no `input`/`stream` access)

  **New Types:**
  - `ToolContext` interface with restricted properties: `memory`, `signal`, `log`, `model`, `deps`
  - `Tool` interface updated to use `ToolContext` in handler signature

  **Breaking Changes:**
  - Tool handlers must now accept `ToolContext` instead of `Ctx`
  - Custom tools need to update their handler signatures
  - AWS S3 tool now uses `ctx.deps` for dependency injection instead of `ctx.state`

  **Dependency Injection:**
  - New `deps` property in `ToolContext` for proper dependency injection
  - Middleware can provide dependencies via `ctx.state.toolDeps`
  - Tools access dependencies via `ctx.deps?.dependencyName`

  **Migration Guide:**

  ```typescript
  // Before
  const myTool: Tool = {
    handler: async (args, ctx: Ctx) => {
      // had access to full context
    },
  };

  // After
  const myTool: Tool = {
    handler: async (args, ctx: ToolContext) => {
      // restricted context with memory, signal, log, model, deps
    },
  };
  ```

- Updated dependencies [de89201]
  - @sisu-ai/core@2.0.0

## 3.0.0

### Patch Changes

- Updated dependencies [e9f7d6c]
  - @sisu-ai/core@1.2.0

## 2.0.3

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@1.1.3

## 2.0.2

### Patch Changes

- Updated dependencies [0e36092]
  - @sisu-ai/core@1.1.2

## 2.0.1

### Patch Changes

- 82e8b95: Add CodeQL badges to documentation for enhanced security scanning
  - Added CodeQL badge to the main README.md for visibility.
  - Included CodeQL badge in the README.md files of various packages:
    - adapters: anthropic, ollama, openai
    - middleware: agent-run-api, context-compressor, control-flow, conversation-buffer, error-boundary, guardrails, invariants, rag, react-parser, register-tools, tool-calling, trace-viewer, usage-tracker
    - server
    - tools: aws-s3, azure-blob, extract-urls, github-projects, summarize-text, terminal, vec-chroma, web-fetch, web-search-duckduckgo, web-search-google, web-search-openai, wikipedia
    - vector: core
- Updated dependencies [82e8b95]
  - @sisu-ai/core@1.1.1

## 2.0.0

### Patch Changes

- Updated dependencies [b2675b7]
  - @sisu-ai/core@1.1.0

## 1.2.1

### Patch Changes

- 03b0e75: docs: Update README files to include badges and community support sections

## 1.2.0

### Minor Changes

- 4ba5272: This pull request updates the sandboxed terminal tool (`@sisu-ai/tool-terminal`) and its documentation to clarify and improve its security model, operator support, and default behavior. The changes emphasize a strict allow-list approach, clarify how shell operators are handled, and add new configuration options for enabling pipelines and command sequences. Tests and examples have been updated to reflect these changes and demonstrate the new features.

  **Terminal tool policy and operator support:**
  - The terminal tool now uses a strict allow-list for commands by default, removing the deny-list and making the default policy read-only and more secure. Shell operators (`|`, `;`, `&&`, `||`) are denied by default but can be enabled explicitly via `allowPipe` and `allowSequence` options in the configuration. Commands run without an intermediate shell, and only permitted operators are allowed when enabled.
  - Documentation has been updated to clarify the new policy, the default allow-list, and how to enable operator support securely. A new section explains how to opt-in to pipelines and sequences, with security notes and usage examples.

  **Example and usage improvements:**
  - The OpenAI terminal example (`examples/openai-terminal`) is updated to use the new operator options (`allowPipe`, `allowSequence`) and a more complex sample user input. The README reflects the new policy and removes outdated tips about deny-lists and destructive commands.
  - The example app now includes the usage tracker middleware for better monitoring and cost estimation.

  **Testing updates:**
  - Tests for the terminal tool have been revised to check the new allow-list behavior, operator restrictions, and path enforcement. New tests verify that pipelines and sequences work only when enabled, and that network commands and paths outside the allowed roots are blocked.

  **Other documentation clarifications:**
  - The terminal tool README clarifies the default configuration, removes references to the deny-list, and explains the realpath-based path scoping and operator handling in more detail.

  These changes make the terminal tool's security model clearer and more robust, with explicit opt-in for advanced shell-like features and improved documentation and tests to match.

## 1.1.0

### Minor Changes

- 93474bf: Add terminal execution tool with session and sandbox policies.
