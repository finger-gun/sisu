#!/usr/bin/env node
import { createDefaultProviders, createRuntimeController, createRuntimeHttpServer } from "./index.js";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

async function main(): Promise<void> {
  const host = process.env.RUNTIME_HOST ?? "127.0.0.1";
  const port = envInt("RUNTIME_PORT", 8787);
  const token = process.env.RUNTIME_API_KEY;
  const providers = createDefaultProviders({
    openAI: {
      apiKey: process.env.OPENAI_API_KEY ?? process.env.API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL ?? process.env.BASE_URL,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? process.env.BASE_URL,
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL ?? process.env.BASE_URL,
    },
  });

  const runtime = createRuntimeController({
    providers,
  });
  const server = createRuntimeHttpServer(runtime, {
    host,
    port,
    apiKey: token,
  });
  const listening = await server.start();
  process.stdout.write(
    `[runtime-desktop] listening on http://${listening.host}:${listening.port}\n`,
  );

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await server.stop();
    process.stdout.write("[runtime-desktop] stopped\n");
  };

  process.on("SIGINT", () => {
    void stop().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void stop().then(() => process.exit(0));
  });
}

void main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[runtime-desktop] fatal error: ${message}\n`);
  process.exit(1);
});
