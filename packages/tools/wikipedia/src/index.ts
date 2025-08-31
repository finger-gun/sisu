import type { Tool, Ctx } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';
import { z } from 'zod';

export type WikipediaFormat = 'summary' | 'html' | 'related';

export interface WikipediaArgs {
  title: string;
  format?: WikipediaFormat;
  lang?: string; // e.g., 'en', 'sv'
}

// Subset of Wikipedia REST responses
interface WikiSummary {
  title?: string;
  displaytitle?: string;
  description?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string }, mobile?: { page?: string } };
  thumbnail?: { source?: string };
  type?: string; // e.g., 'standard' | 'disambiguation'
}
interface WikiRelatedItem { title?: string; extract?: string; description?: string; content_urls?: { desktop?: { page?: string } }; thumbnail?: { source?: string } }
interface WikiRelated { pages?: WikiRelatedItem[] }

export type WikipediaSummaryResult = {
  type?: string;
  title: string;
  description?: string;
  extract?: string;
  url?: string;
  thumbnailUrl?: string;
};

export type WikipediaRelatedResult = Array<{
  title: string;
  description?: string;
  extract?: string;
  url?: string;
  thumbnailUrl?: string;
}>;

export const wikipedia: Tool<WikipediaArgs> = {
  name: 'wikipediaLookup',
  description: 'Fetch a Wikipedia page summary, HTML, or related pages given an approximate title. Defaults to summary.',
  schema: z.object({
    title: z.string().min(1),
    format: z.enum(['summary','html','related']).optional(),
    lang: z.string().min(2).max(10).optional(),
  }),
  handler: async ({ title, format = 'summary', lang }, ctx: Ctx) => {
    const base = resolveBaseUrl(ctx, lang);
    if (format === 'html') return fetchHtml(base, title);
    if (format === 'related') return fetchRelated(base, title);
    return fetchSummary(base, title);
  }
};

export default wikipedia;

function resolveBaseUrl(ctx: Ctx | undefined, lang?: string): string {
  // Precedence: CLI flags (via core helpers) > env vars; allow overriding full base or just language
  const baseFromFlags = firstConfigValue(['WIKIPEDIA_BASE_URL','WIKI_BASE_URL']);
  const langFromFlags = firstConfigValue(['WIKIPEDIA_LANG','WIKI_LANG']) || lang;
  if (baseFromFlags) return baseFromFlags.replace(/\/$/, '');
  const chosenLang = (langFromFlags || 'en').toLowerCase();
  return `https://${chosenLang}.wikipedia.org/api/rest_v1`;
}

async function fetchSummary(baseUrl: string, title: string): Promise<WikipediaSummaryResult> {
  const url = `${baseUrl}/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Wikipedia summary failed: ${res.status} ${res.statusText}`);
  const json: WikiSummary = raw ? JSON.parse(raw) : {};
  return {
    type: json.type,
    title: String(json.displaytitle || json.title || title),
    description: json.description,
    extract: json.extract,
    url: json.content_urls?.desktop?.page || json.content_urls?.mobile?.page,
    thumbnailUrl: json.thumbnail?.source,
  };
}

async function fetchHtml(baseUrl: string, title: string): Promise<string> {
  const url = `${baseUrl}/page/html/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { Accept: 'text/html' } });
  const raw = await res.text();
  const ct = res.headers?.get?.('content-type') || '';
  if (!res.ok) throw new Error(`Wikipedia html failed: ${res.status} ${res.statusText}`);
  if (!ct.toLowerCase().includes('text/html')) throw new Error(`Wikipedia html returned non-HTML content (content-type: ${ct})`);
  return raw;
}

async function fetchRelated(baseUrl: string, title: string): Promise<WikipediaRelatedResult> {
  const url = `${baseUrl}/page/related/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Wikipedia related failed: ${res.status} ${res.statusText}`);
  const json: WikiRelated = raw ? JSON.parse(raw) : {};
  const pages = Array.isArray(json.pages) ? json.pages : [];
  return pages.map(p => ({
    title: String(p.title || ''),
    description: p.description,
    extract: p.extract,
    url: p.content_urls?.desktop?.page,
    thumbnailUrl: p.thumbnail?.source,
  })).filter(r => r.title);
}

