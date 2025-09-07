# @sisu-ai/tool-terminal

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
