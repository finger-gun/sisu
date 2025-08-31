import type { Tool } from '@sisu-ai/core';
export interface OpenAIWebSearchArgs {
    query: string;
}
export declare const openAIWebSearch: Tool<OpenAIWebSearchArgs>;
export default openAIWebSearch;
