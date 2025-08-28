import 'dotenv/config';

/**
 * Centralized environment access (provider-agnostic).
 * Defaults are sensible, but you can override via env.
 */
export function getApiKey(): string {
  const key = process.env.AI_API_KEY || process.env.API_KEY;
  if (!key) {
    throw new Error('Missing AI_API_KEY in environment. Set it in .env or your shell.');
  }
  return key;
}

export function getBaseUrl(): string {
  // Default points to an OpenAI-compatible gateway; override as needed.
  return process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1';
}

export function getTimeoutMs(): number {
  const raw = process.env.AI_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

export function getChatPath(): string {
  // Path for chat completion endpoint on OpenAI-compatible APIs
  return process.env.AI_CHAT_PATH || '/chat/completions';
}
