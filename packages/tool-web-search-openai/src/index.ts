import type { Tool } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';
import { z } from 'zod';

export interface OpenAIWebSearchArgs { query: string; }

// Uses OpenAI Responses API web_search tool
export const openAIWebSearch: Tool<OpenAIWebSearchArgs> = {
  name: 'webSearch',
  description: 'Search the web using OpenAI\'s built-in web search tool.',
  schema: z.object({ query: z.string() }),
  handler: async ({ query }, ctx) => {
    const st: any = (ctx?.state ?? {});
    const stOpenAI = (st.openai ?? {}) as any;
    const cliApiKey = stOpenAI.apiKey ?? st.apiKey;
    const apiKey = cliApiKey || firstConfigValue(['OPENAI_API_KEY','API_KEY']);
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY or API_KEY');

    const cliRespBase = stOpenAI.responsesBaseUrl ?? st.responsesBaseUrl;
    const cliBase = stOpenAI.baseUrl ?? st.baseUrl;
    const envBase = firstConfigValue(['OPENAI_RESPONSES_BASE_URL','OPENAI_BASE_URL','BASE_URL']);
    const baseUrl = ((cliRespBase || cliBase || envBase) ?? 'https://api.openai.com').replace(/\/$/, '');
    const fromMeta = (ctx?.model as any)?.meta?.responseModel || (ctx?.model as any)?.responseModel;
    const fromAdapterName = typeof ctx?.model?.name === 'string' && ctx.model.name.startsWith('openai:')
      ? ctx.model.name.slice('openai:'.length)
      : undefined;
    const cliRespModel = stOpenAI.responsesModel ?? st.responsesModel;
    const cliModel = stOpenAI.model ?? st.model;
    let model = cliRespModel || cliModel || firstConfigValue(['OPENAI_RESPONSES_MODEL','OPENAI_MODEL']) || fromMeta || fromAdapterName || 'gpt-4.1-mini';

    const url = `${baseUrl}/v1/responses`;
    const body = {
      model,
      input: query,
      tools: [{ type: 'web_search' }],
      tool_choice: { type: 'web_search' as const }
    };

    const DEBUG = String(process.env.DEBUG_LLM || '').toLowerCase() === 'true' || process.env.DEBUG_LLM === '1';
    if (DEBUG) {
      try {
        // eslint-disable-next-line no-console
        console.error('[DEBUG_LLM] request', { url, headers: { Authorization: 'Bearer ***', 'Content-Type': 'application/json', Accept: 'application/json' }, body });
      } catch {}
    }

    const doRequest = async (modelToUse: string) => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({ ...body, model: modelToUse })
    });

    let res = await doRequest(model);
    let raw = await res.text();
    if (!res.ok) {
      let details = raw;
      try { const j = JSON.parse(raw); details = j.error?.message ?? raw; } catch {}
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.error('[DEBUG_LLM] response_error', { status: res.status, statusText: res.statusText, body: typeof raw === 'string' ? raw.slice(0, 500) : raw });
      }
      // Retry once with a safe default model if we suspect model/tool mismatch
      const msg = String(details).toLowerCase();
      const shouldRetry = res.status === 400 || msg.includes('tool') || msg.includes('web_search');
      if (shouldRetry && model !== 'gpt-4.1-mini') {
        const fallback = 'gpt-4.1-mini';
        if (DEBUG) { try { console.error('[DEBUG_LLM] retrying with fallback model', { from: model, to: fallback }); } catch {} }
        model = fallback;
        res = await doRequest(model);
        raw = await res.text();
        if (!res.ok) {
          let d2 = raw; try { const j2 = JSON.parse(raw); d2 = j2.error?.message ?? raw; } catch {}
          throw new Error(`OpenAI web search failed: ${res.status} ${res.statusText} — ${String(d2).slice(0, 500)}`);
        }
      } else {
        throw new Error(`OpenAI web search failed: ${res.status} ${res.statusText} — ${String(details).slice(0, 500)}`);
      }
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('application/json')) {
      if (DEBUG) {
        try {
          // eslint-disable-next-line no-console
          console.error('[DEBUG_LLM] non_json_response', { contentType: ct, snippet: typeof raw === 'string' ? raw.slice(0, 200) : raw });
        } catch {}
      }
      throw new Error(`OpenAI web search returned non-JSON content (content-type: ${ct}). Check OPENAI_BASE_URL/BASE_URL and API key. Snippet: ${String(raw).slice(0, 200)}`);
    }
    const json: any = raw ? JSON.parse(raw) : {};
    if (DEBUG) {
      try {
        // eslint-disable-next-line no-console
        console.error('[DEBUG_LLM] response_ok', { keys: Object.keys(json ?? {}), outputType: Array.isArray(json?.output) ? 'array' : typeof json?.output });
      } catch {}
    }
    const results = json.output?.find?.((p: any) => p.type === 'web_search_results')?.web_search_results
      ?? json.output?.[0]?.content?.find?.((c: any) => c.type === 'web_search_results')?.web_search_results;
    return results ?? json;
  }
};

export default openAIWebSearch;
