import type { Tool } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';
import { z } from 'zod';

export type WebFetchFormat = 'text' | 'html' | 'json';

export interface WebFetchArgs {
  url: string;
  format?: WebFetchFormat; // default 'text'
  maxBytes?: number; // safety cap for response size
}

export interface WebFetchResult {
  url: string;
  finalUrl?: string;
  status: number;
  contentType?: string;
  title?: string;
  text?: string;
  html?: string;
  json?: unknown;
}

export const webFetch: Tool<WebFetchArgs> = {
  name: 'webFetch',
  description: 'Fetch a web page by URL and return text, HTML, or JSON. Defaults to text extraction for HTML.',
  schema: z.object({
    url: z.string().url(),
    format: z.enum(['text','html','json']).optional(),
    maxBytes: z.number().int().positive().max(5_000_000).optional(),
  }),
  handler: async ({ url, format = 'text', maxBytes }, _ctx): Promise<WebFetchResult> => {
    const ua = firstConfigValue(['WEB_FETCH_USER_AGENT','HTTP_USER_AGENT'])
      || 'SisuWebFetch/0.1 (+https://github.com/finger-gun/sisu)';
    const capEnv = firstConfigValue(['WEB_FETCH_MAX_BYTES']);
    const cap = Number(maxBytes ?? (capEnv !== undefined ? Number(capEnv) : 500_000));

    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': ua, 'Accept': '*/*' },
    } as any);

    const contentType = res.headers?.get?.('content-type') || '';
    // Stream read with cap to avoid massive bodies
    const buf = await readWithCap(res, cap);
    const finalUrl = (res as any).url || undefined;
    if (!res.ok) {
      return { url, finalUrl, status: res.status, contentType, text: truncateText(buf.toString('utf8')) };
    }

    // Handle by requested format and content-type
    const ctLower = contentType.toLowerCase();
    if (format === 'json' || ctLower.includes('application/json')) {
      try {
        const json = JSON.parse(buf.toString('utf8'));
        return { url, finalUrl, status: res.status, contentType, json };
      } catch {
        // Fall through to text
      }
    }

    if (format === 'html' || ctLower.includes('text/html') || ctLower.includes('application/xhtml')) {
      const html = buf.toString('utf8');
      if (format === 'html') {
        return { url, finalUrl, status: res.status, contentType, html, title: extractTitle(html) };
      }
      // format === 'text'
      const text = htmlToText(html);
      return { url, finalUrl, status: res.status, contentType, text, title: extractTitle(html), html: undefined };
    }

    // Fallback: treat as text/*
    const text = buf.toString('utf8');
    return { url, finalUrl, status: res.status, contentType, text: truncateText(text) };
  },
};

export default webFetch;

async function readWithCap(res: Response, cap: number): Promise<Buffer> {
  // If body is not a stream (older fetch mocks), try res.text()
  const anyRes: any = res as any;
  if (!anyRes.body || typeof anyRes.body.getReader !== 'function') {
    const t = typeof anyRes.text === 'function' ? await anyRes.text() : '';
    return Buffer.from(String(t), 'utf8');
  }
  const reader = anyRes.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > cap) break;
      chunks.push(value);
    }
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return Buffer.from(out);
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  return decodeHTMLEntities(m[1]).trim();
}

function htmlToText(html: string): string {
  // Remove script/style
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Replace <br> and block tags with newlines
  s = s.replace(/<(br|BR)\s*\/?>(\n)?/g, '\n');
  s = s.replace(/<\/(p|div|section|article|h[1-6]|li|ul|ol|header|footer|main)>/gi, '\n');
  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode entities
  s = decodeHTMLEntities(s);
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return truncateText(s);
}

function truncateText(text: string, max = 200_000): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// Minimal HTML entity decoder for common entities
function decodeHTMLEntities(s: string): string {
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => map[m] || m);
}
