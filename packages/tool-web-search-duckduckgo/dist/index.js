import { z } from 'zod';
export const duckDuckGoWebSearch = {
    name: 'webSearch',
    description: 'Search the web using the DuckDuckGo Instant Answer API.',
    schema: z.object({ query: z.string() }),
    handler: async ({ query }) => {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`DuckDuckGo search failed: ${res.status} ${res.statusText}`);
        const data = await res.json();
        const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
        const results = topics
            .filter((t) => t.Text && t.FirstURL)
            .slice(0, 5)
            .map((t) => ({ title: t.Text, url: t.FirstURL }));
        return results;
    }
};
export default duckDuckGoWebSearch;
