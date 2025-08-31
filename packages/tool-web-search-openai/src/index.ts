import type { Tool } from '@sisu-ai/core';
import { z } from 'zod';

export interface OpenAIWebSearchArgs { query: string; }

// Uses OpenAI Responses API web_search tool
export const openAIWebSearch: Tool<OpenAIWebSearchArgs> = {
  name: 'webSearch',
  description: 'Search the web using OpenAI\'s built-in web search tool.',
  schema: z.object({ query: z.string() }),
  handler: async ({ query }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: query,
        tools: [{ type: 'web_search' }],
        tool_choice: { type: 'web_search' }
      })
    });
    if (!res.ok) throw new Error(`OpenAI web search failed: ${res.status} ${res.statusText}`);
    const json: any = await res.json();
    const results = json.output?.find?.((p: any) => p.type === 'web_search_results')?.web_search_results
      ?? json.output?.[0]?.content?.find?.((c: any) => c.type === 'web_search_results')?.web_search_results;
    return results ?? json;
  }
};

export default openAIWebSearch;
