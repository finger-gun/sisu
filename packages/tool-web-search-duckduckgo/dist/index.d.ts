import type { Tool } from '@sisu-ai/core';
export interface DuckDuckGoSearchArgs {
    query: string;
}
export declare const duckDuckGoWebSearch: Tool<DuckDuckGoSearchArgs>;
export default duckDuckGoWebSearch;
