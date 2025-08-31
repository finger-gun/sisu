import type { Tool } from '@sisu-ai/core';
import { z } from 'zod';

export interface DuckDuckGoSearchArgs { query: string; }

export const duckDuckGoWebSearch: Tool<DuckDuckGoSearchArgs> = {
  name: 'webSearch',
  description: 'Search the web using the DuckDuckGo Instant Answer API.',
  schema: z.object({ query: z.string() }),
  handler: async ({ query }) => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`DuckDuckGo search failed: ${res.status} ${res.statusText}`);
    const data: any = await res.json();
    const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    const results = topics
      .filter((t: any) => t.Text && t.FirstURL)
      .slice(0, 5)
      .map((t: any) => ({ title: t.Text, url: t.FirstURL }));
    return results;
  }
};

export default duckDuckGoWebSearch;
