{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --import tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sisu-ai/core": "latest",
    "@sisu-ai/adapter-openai": "latest",
    "@sisu-ai/mw-conversation-buffer": "latest",
    "@sisu-ai/mw-error-boundary": "latest",
    "@sisu-ai/mw-trace-viewer": "latest",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "typescript": "^5.9.2"
  }
}
