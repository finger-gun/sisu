{
  "changesets": [
    {
      "releases": [
        {
          "name": "@sisu-ai/mw-register-tools",
          "type": "minor"
        },
        {
          "name": "@sisu-ai/core",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-tool-calling",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-terminal",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/adapter-anthropic",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/adapter-ollama",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/adapter-openai",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-agent-run-api",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-context-compressor",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-control-flow",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-conversation-buffer",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-cors",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-error-boundary",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-guardrails",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-invariants",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-rag",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-react-parser",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-trace-viewer",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/mw-usage-tracker",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/server",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-aws-s3",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-azure-blob",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-extract-urls",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-github-projects",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-summarize-text",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-vec-chroma",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-web-fetch",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-web-search-duckduckgo",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-web-search-openai",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/tool-wikipedia",
          "type": "patch"
        },
        {
          "name": "@sisu-ai/vector-core",
          "type": "patch"
        }
      ],
      "summary": "Infrastructure migration to pnpm + Turbo and tool aliasing support\n\n**Infrastructure Updates:**\n- Migrated from npm to pnpm for faster, more efficient dependency management\n- Added Turbo for optimized monorepo builds with caching\n- Updated all package dependencies and peer dependencies\n\n**New Feature:**\n- Added optional tool aliasing support in `registerTools` middleware - map SISU tool names to ecosystem-standard aliases (e.g., 'bash', 'read_file')\n\n**Example Usage:**\n```typescript\nregisterTools(terminal.tools, {\n  aliases: {\n    'terminalRun': 'bash',\n    'terminalReadFile': 'read_file'\n  }\n})\n```\n\n**Maintenance:**\n- Code formatting standardization across packages\n- Internal improvements to tool-calling middleware",
      "id": "pnpm-turbo-migration-and-tool-aliasing"
    }
  ],
  "releases": [
    {
      "name": "@sisu-ai/mw-register-tools",
      "type": "minor",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.1.0"
    },
    {
      "name": "@sisu-ai/core",
      "type": "patch",
      "oldVersion": "2.3.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "2.3.1"
    },
    {
      "name": "@sisu-ai/mw-tool-calling",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/tool-terminal",
      "type": "patch",
      "oldVersion": "7.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "7.0.1"
    },
    {
      "name": "@sisu-ai/adapter-anthropic",
      "type": "patch",
      "oldVersion": "7.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "7.0.1"
    },
    {
      "name": "@sisu-ai/adapter-ollama",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/adapter-openai",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/mw-agent-run-api",
      "type": "patch",
      "oldVersion": "7.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "7.0.1"
    },
    {
      "name": "@sisu-ai/mw-context-compressor",
      "type": "patch",
      "oldVersion": "8.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "8.0.1"
    },
    {
      "name": "@sisu-ai/mw-control-flow",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/mw-conversation-buffer",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/mw-cors",
      "type": "patch",
      "oldVersion": "7.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "7.0.1"
    },
    {
      "name": "@sisu-ai/mw-error-boundary",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/mw-guardrails",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/mw-invariants",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/mw-rag",
      "type": "patch",
      "oldVersion": "8.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "8.0.1"
    },
    {
      "name": "@sisu-ai/mw-react-parser",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/mw-trace-viewer",
      "type": "patch",
      "oldVersion": "10.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "10.0.1"
    },
    {
      "name": "@sisu-ai/mw-usage-tracker",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/server",
      "type": "patch",
      "oldVersion": "7.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "7.0.1"
    },
    {
      "name": "@sisu-ai/tool-aws-s3",
      "type": "patch",
      "oldVersion": "2.0.1",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "2.0.2"
    },
    {
      "name": "@sisu-ai/tool-azure-blob",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/tool-extract-urls",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/tool-github-projects",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/tool-summarize-text",
      "type": "patch",
      "oldVersion": "9.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "9.0.1"
    },
    {
      "name": "@sisu-ai/tool-vec-chroma",
      "type": "patch",
      "oldVersion": "7.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "7.0.1"
    },
    {
      "name": "@sisu-ai/tool-web-fetch",
      "type": "patch",
      "oldVersion": "8.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "8.0.1"
    },
    {
      "name": "@sisu-ai/tool-web-search-duckduckgo",
      "type": "patch",
      "oldVersion": "8.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "8.0.1"
    },
    {
      "name": "@sisu-ai/tool-web-search-openai",
      "type": "patch",
      "oldVersion": "8.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "8.0.1"
    },
    {
      "name": "@sisu-ai/tool-wikipedia",
      "type": "patch",
      "oldVersion": "8.0.0",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "8.0.1"
    },
    {
      "name": "@sisu-ai/vector-core",
      "type": "patch",
      "oldVersion": "1.0.4",
      "changesets": [
        "pnpm-turbo-migration-and-tool-aliasing"
      ],
      "newVersion": "1.0.5"
    },
    {
      "name": "anthropic-control-flow",
      "type": "none",
      "oldVersion": "0.2.19",
      "changesets": [],
      "newVersion": "0.2.19"
    },
    {
      "name": "anthropic-weather",
      "type": "none",
      "oldVersion": "0.2.19",
      "changesets": [],
      "newVersion": "0.2.19"
    },
    {
      "name": "ollama-weather",
      "type": "none",
      "oldVersion": "0.1.24",
      "changesets": [],
      "newVersion": "0.1.24"
    },
    {
      "name": "ollama-web-search",
      "type": "none",
      "oldVersion": "0.1.22",
      "changesets": [],
      "newVersion": "0.1.22"
    },
    {
      "name": "openai-aws-s3",
      "type": "none",
      "oldVersion": "0.1.22",
      "changesets": [],
      "newVersion": "0.1.22"
    },
    {
      "name": "openai-azure-blob",
      "type": "none",
      "oldVersion": "0.1.23",
      "changesets": [],
      "newVersion": "0.1.23"
    },
    {
      "name": "openai-control-flow",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "openai-error-handling",
      "type": "none",
      "oldVersion": "0.1.3",
      "changesets": [],
      "newVersion": "0.1.3"
    },
    {
      "name": "openai-extract-urls",
      "type": "none",
      "oldVersion": "0.1.22",
      "changesets": [],
      "newVersion": "0.1.22"
    },
    {
      "name": "openai-github-projects",
      "type": "none",
      "oldVersion": "0.1.22",
      "changesets": [],
      "newVersion": "0.1.22"
    },
    {
      "name": "@sisu-ai/example-openai-rag-chroma",
      "type": "none",
      "oldVersion": "0.1.23",
      "changesets": [],
      "newVersion": "0.1.23"
    },
    {
      "name": "openai-react",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "openai-terminal",
      "type": "none",
      "oldVersion": "0.1.19",
      "changesets": [],
      "newVersion": "0.1.19"
    },
    {
      "name": "openai-terminal-aliased",
      "type": "none",
      "oldVersion": "0.1.0",
      "changesets": [],
      "newVersion": "0.1.0"
    },
    {
      "name": "openai-weather",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "openai-web-fetch",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "openai-web-search",
      "type": "none",
      "oldVersion": "0.2.22",
      "changesets": [],
      "newVersion": "0.2.22"
    },
    {
      "name": "openai-wikipedia",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "tool-alias-test",
      "type": "patch",
      "oldVersion": "1.0.0",
      "changesets": [],
      "newVersion": "1.0.1"
    },
    {
      "name": "anthropic-hello",
      "type": "none",
      "oldVersion": "0.2.19",
      "changesets": [],
      "newVersion": "0.2.19"
    },
    {
      "name": "anthropic-stream",
      "type": "none",
      "oldVersion": "0.1.15",
      "changesets": [],
      "newVersion": "0.1.15"
    },
    {
      "name": "ollama-hello",
      "type": "none",
      "oldVersion": "0.1.24",
      "changesets": [],
      "newVersion": "0.1.24"
    },
    {
      "name": "ollama-stream",
      "type": "none",
      "oldVersion": "0.1.17",
      "changesets": [],
      "newVersion": "0.1.17"
    },
    {
      "name": "ollama-vision",
      "type": "none",
      "oldVersion": "0.1.11",
      "changesets": [],
      "newVersion": "0.1.11"
    },
    {
      "name": "openai-branch",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "openai-graph",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "openai-guardrails",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "openai-hello",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "openai-parallel",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    },
    {
      "name": "openai-reasoning",
      "type": "none",
      "oldVersion": "0.1.2",
      "changesets": [],
      "newVersion": "0.1.2"
    },
    {
      "name": "openai-server",
      "type": "none",
      "oldVersion": "0.0.16",
      "changesets": [],
      "newVersion": "0.0.16"
    },
    {
      "name": "openai-stream",
      "type": "none",
      "oldVersion": "0.1.17",
      "changesets": [],
      "newVersion": "0.1.17"
    },
    {
      "name": "openai-vision",
      "type": "none",
      "oldVersion": "0.2.21",
      "changesets": [],
      "newVersion": "0.2.21"
    }
  ]
}