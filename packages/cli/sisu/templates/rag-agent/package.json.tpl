{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --import tsx src/index.ts \"What is Sisu best suited for?\"",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sisu-ai/core": "latest",
    "@sisu-ai/adapter-openai": "latest",
    "@sisu-ai/mw-conversation-buffer": "latest",
    "@sisu-ai/mw-register-tools": "latest",
    "@sisu-ai/mw-tool-calling": "latest",
    "@sisu-ai/rag-core": "latest",
    "@sisu-ai/tool-rag": "latest",
    "@sisu-ai/vector-vectra": "latest",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "typescript": "^5.9.2"
  }
}
