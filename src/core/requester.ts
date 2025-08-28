export interface Requester {
  (
    path: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
      signal?: AbortSignal;
    }
  ): Promise<any>;
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = baseUrl.replace(/\/?$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function createHttpRequester(opts: {
  baseUrl: string;
  defaultHeaders?: () => Record<string, string>;
  timeoutMs?: number;
}): Requester {
  const { baseUrl, defaultHeaders, timeoutMs = 30_000 } = opts;
  return async (path, init = {}) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(defaultHeaders ? defaultHeaders() : {}),
      ...(init.headers || {}),
    };
    const method = init.method ?? 'POST';
    const url = joinUrl(baseUrl, path);
    const body = init.body !== undefined ? JSON.stringify(init.body) : undefined;
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 500)}`);
      }
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(t);
    }
  };
}

