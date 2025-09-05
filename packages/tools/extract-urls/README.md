# @sisu-ai/tool-extract-urls
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-extract-urls)](https://www.npmjs.com/package/@sisu-ai/tool-extract-urls)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

Extract unique `http`/`https` URLs from text snippets. Small, deterministic, and zero I/O — great as a first pass before fetching, classifying, or summarizing pages.

## Install
```bash
npm i @sisu-ai/tool-extract-urls
```

## Why it’s useful
- Simple guardrail: avoids asking the model to spot links.
- Deterministic: same inputs → same outputs.
- Lightweight: no network calls, safe to run early in a pipeline.

## Usage
```ts
import { Agent, SimpleTools } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { extractUrlsTool } from '@sisu-ai/tool-extract-urls';

const app = new Agent()
  .use(registerTools([extractUrlsTool]))
  .use(toolCalling);

// Prompt example: "Find links in: https://example.com and http://sisu.ai"
```

## What it returns
- Array of unique URLs, e.g. `["https://example.com", "http://sisu.ai"]`.

## Notes
- The regex targets `http`/`https` URLs and ignores surrounding punctuation where possible.
- Prefer pairing with a fetch tool (e.g., `@sisu-ai/tool-web-fetch`) for subsequent content analysis.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
