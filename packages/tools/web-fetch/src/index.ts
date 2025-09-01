import type { Tool } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';
import { z } from 'zod';

export type WebFetchFormat = 'text' | 'html' | 'json';

export interface WebFetchArgs {
  url: string;
  format?: WebFetchFormat; // default 'text'
  maxBytes?: number; // safety cap for response size
  respectRobots?: boolean; // default true (can be disabled via flag)
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
  // robots.txt metadata when blocked
  robotsBlocked?: boolean;
  robotsAgent?: string;
}

export const webFetch: Tool<WebFetchArgs> = {
  name: 'webFetch',
  description: 'Fetch a web page by URL and return text, HTML, or JSON. Defaults to text extraction for HTML.',
  schema: z.object({
    url: z.string().url(),
    format: z.enum(['text','html','json']).optional(),
    maxBytes: z.number().int().positive().max(5_000_000).optional(),
  }),
  handler: async ({ url, format = 'text', maxBytes, respectRobots }, ctx): Promise<WebFetchResult> => {
    const ua = firstConfigValue(['WEB_FETCH_USER_AGENT','HTTP_USER_AGENT'])
      || 'SisuWebFetch/0.1 (+https://github.com/finger-gun/sisu)';
    const capEnv = firstConfigValue(['WEB_FETCH_MAX_BYTES']);
    const cap = Number(maxBytes ?? (capEnv !== undefined ? Number(capEnv) : 500_000));

    // robots.txt compliance (default on; disable with arg or env WEB_FETCH_RESPECT_ROBOTS=0)
    const respect = (() => {
      if (typeof respectRobots === 'boolean') return respectRobots;
      const env = firstConfigValue(['WEB_FETCH_RESPECT_ROBOTS','RESPECT_ROBOTS']);
      if (env === undefined) return true; // default on
      return !(env === '0' || /^false$/i.test(env));
    })();

    if (respect) {
      const decision = await robotsDecision(url, ua).catch(() => ({ allowed: true } as RobotsDecision));
      if (!decision.allowed) {
        ctx?.log?.info?.('[webFetch] blocked by robots.txt', {
          url,
          userAgent: ua,
          matchedAgent: decision.matchedAgent,
          ruleType: decision.ruleType,
          rulePattern: decision.rulePattern,
        });
        return {
          url,
          status: 403,
          contentType: 'text/plain',
          text: `Blocked by robots.txt (agent: ${decision.matchedAgent ?? 'unknown'}, rule: ${decision.ruleType ?? 'disallow'} ${decision.rulePattern ?? ''})`.
            trim(),
          robotsBlocked: true,
          robotsAgent: ua
        };
      }
    }

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

// --- robots.txt helpers ---
type RobotsGroup = { agents: string[]; allows: string[]; disallows: string[] };
type RobotsRules = { groups: RobotsGroup[] };
type RobotsDecision = { allowed: boolean; matchedAgent?: string; ruleType?: 'allow'|'disallow'; rulePattern?: string };
const robotsCache = new Map<string, { ts: number; rules: RobotsRules | null }>();

async function robotsDecision(targetUrl: string, userAgent: string): Promise<RobotsDecision> {
  const u = new URL(targetUrl);
  const origin = `${u.protocol}//${u.host}`;
  const cache = robotsCache.get(origin);
  const now = Date.now();
  if (!cache || (now - cache.ts) > 60 * 60 * 1000) { // 1h TTL
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const res = await fetch(robotsUrl, { headers: { 'User-Agent': userAgent, 'Accept': 'text/plain' } } as any);
      const txt = await res.text();
      const rules = res.ok ? parseRobots(txt) : null;
      robotsCache.set(origin, { ts: now, rules });
    } catch {
      robotsCache.set(origin, { ts: now, rules: null });
    }
  }
  const rules = robotsCache.get(origin)?.rules;
  if (!rules) return { allowed: true };
  return evaluateRobotsDetailed(rules, userAgent, u.pathname + (u.search || ''));
}

function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      // Start a new group if we already had one and it contains rules
      if (!current || (current.allows.length + current.disallows.length) > 0) {
        current = { agents: [], allows: [], disallows: [] };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
    } else if (key === 'allow') {
      if (!current) { current = { agents: ['*'], allows: [], disallows: [] }; groups.push(current); }
      current.allows.push(val);
    } else if (key === 'disallow') {
      if (!current) { current = { agents: ['*'], allows: [], disallows: [] }; groups.push(current); }
      current.disallows.push(val);
    }
  }
  return { groups };
}

function evaluateRobotsDetailed(rules: RobotsRules, userAgent: string, pathWithQuery: string): RobotsDecision {
  // Match exact agent token (product) ignoring case, or '*'.
  // Example: 'SisuWebFetch/0.1 (+...)' -> baseAgent 'sisuwebfetch'
  const baseAgent = (userAgent.split(/[\/\s]/)[0] || '').toLowerCase();
  const agentMatches = (agent: string) => {
    if (agent === '*') return true;
    return agent.toLowerCase() === baseAgent;
  };
  const matching = rules.groups
    .map(g => ({ g, matchedAgent: g.agents.find(agentMatches) }))
    .filter(x => !!x.matchedAgent) as Array<{ g: RobotsGroup, matchedAgent: string }>;
  const selected = matching.length
    ? matching
    : rules.groups.filter(g => g.agents.includes('*')).map(g => ({ g, matchedAgent: '*' }));
  if (!selected.length) return { allowed: true };
  // longest match wins between allow and disallow
  let bestType: 'allow' | 'disallow' | undefined;
  let bestLen = -1;
  let bestPat: string | undefined;
  let bestAgent: string | undefined;
  for (const { g, matchedAgent } of selected) {
    for (const pat of g.allows) {
      if (!pat) continue;
      if (patternMatches(pat, pathWithQuery)) {
        const L = pat.length;
        if (L > bestLen) { bestLen = L; bestType = 'allow'; bestPat = pat; bestAgent = matchedAgent; }
      }
    }
    for (const pat of g.disallows) {
      if (!pat) continue;
      if (patternMatches(pat, pathWithQuery)) {
        const L = pat.length;
        if (L > bestLen) { bestLen = L; bestType = 'disallow'; bestPat = pat; bestAgent = matchedAgent; }
      }
    }
  }
  if (bestType === 'disallow') return { allowed: false, matchedAgent: bestAgent, ruleType: 'disallow', rulePattern: bestPat };
  return { allowed: true, matchedAgent: bestAgent, ruleType: bestType, rulePattern: bestPat };
}

function patternMatches(pat: string, path: string): boolean {
  // Support '*' wildcard and '$' end anchor; treat path as starting with '/'
  let p = pat.trim();
  if (p === '') return false;
  // Empty disallow means allow all; already handled by return false above
  // Convert to regex
  const escaped = p.replace(/[.+?^${}()|\[\]\\]/g, r => '\\' + r);
  let reStr = '^' + escaped.replace(/\*/g, '.*');
  if (reStr.endsWith('\$')) { reStr = reStr.slice(0, -2) + '$'; }
  const re = new RegExp(reStr);
  return re.test(path);
}

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
  // Remove script/style robustly: allow attributes and sloppy closing tags like </script foo="bar"> or </script >
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ');
  // Remove HTML comments, including non-standard end '--!>' browsers tolerate
  s = s.replace(/<!--[\s\S]*?--!?>(\n)?/g, ' ');
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
