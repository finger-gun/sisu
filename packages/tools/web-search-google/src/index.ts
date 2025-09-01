import type { Tool } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';
import { z } from 'zod';

export interface GoogleSearchArgs {
  query: string;
  num?: number;    // 1..10
  start?: number;  // 1..100 (1-based index)
  safe?: 'active'|'off';
  lang?: string;   // best-effort via hl
}

export type GoogleSearchResult = Array<{ title?: string; url: string; snippet?: string }>;

export const googleSearch: Tool<GoogleSearchArgs> = {
  name: 'googleSearch',
  description: 'Search via Google Programmable Search (CSE) JSON API. Requires GOOGLE_API_KEY and GOOGLE_CSE_CX.',
  schema: z.object({
    query: z.string().min(1),
    num: z.number().int().min(1).max(10).optional(),
    start: z.number().int().min(1).max(100).optional(),
    safe: z.enum(['active','off']).optional(),
    lang: z.string().min(2).max(10).optional(),
  }),
  handler: async ({ query, num = 10, start = 1, safe = 'active', lang = 'en' }): Promise<GoogleSearchResult> => {
    const key = firstConfigValue(['GOOGLE_API_KEY','GOOGLE_CSE_API_KEY','CSE_API_KEY']);
    const cx = firstConfigValue(['GOOGLE_CSE_CX','GOOGLE_CSE_ID','CSE_CX']);
    if (!key || !cx) throw new Error('Missing GOOGLE_API_KEY and/or GOOGLE_CSE_CX');
    const params = new URLSearchParams({ key, cx, q: query, num: String(num), start: String(start), safe, hl: lang });
    const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } } as any);
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw; try { const j = JSON.parse(raw); msg = j.error?.message ?? raw; } catch {}
      throw new Error(`Google CSE search failed: ${res.status} ${res.statusText} — ${String(msg).slice(0, 500)}`);
    }
    const json: any = raw ? JSON.parse(raw) : {};
    const items: any[] = Array.isArray(json.items) ? json.items : [];
    return items.map(it => ({ title: it.title, url: it.link, snippet: it.snippet })).filter(r => r.url);
  },
};

export default googleSearch;
