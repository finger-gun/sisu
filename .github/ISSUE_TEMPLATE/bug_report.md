---
name: Bug report
about: Create a report to help us improve
title: "[bug]"
labels: ''
assignees: ''

---

# 🐛 Bug Report

**Describe the bug**
A clear and concise description of the problem you encountered while using Sisu.

---

**To Reproduce**
Steps to reproduce the behavior (include code snippets if possible):

1. Install / setup `...`
2. Run command `...`
3. Use tool/adapter `...`
4. See error

```ts
// Example snippet if relevant
const result = await myAgent.run("...");
```

---

**Expected behavior**
What you expected to happen instead.

---

**Logs / Traces / Screenshots**

* Console logs or stack traces:

  ```text
  [Paste relevant logs here]
  ```
* **trace.json** (if available, attach or paste relevant parts).
* **trace.html** (if generated, attach or link for visualization).
* Screenshots of console/UI if applicable.

---

**Prompts**
If the issue is related to prompts or tool-calling, please include:

* The prompt you used.
* The model and adapter configuration (e.g. `gpt-4o-mini` via `@sisu-ai/adapter-openai`).

---

**Environment (please complete the following information):**

* OS: \[e.g. macOS 14.5, Ubuntu 22.04]
* Node.js version: \[e.g. 20.12.2]
* Package manager: \[pnpm / npm / yarn + version]
* Sisu version: \[e.g. 0.3.1]
* Adapters/tools used: \[e.g. `@sisu-ai/adapter-openai@3.0.0`, `@sisu-ai/tool-aws-s3@0.1.0`]

---

**Additional context**
Add any other details about your setup or the problem here (e.g. config file, environment variables, network restrictions).
