import type { Tool } from '@sisu-ai/core';
/**
 * Extract all unique URLs from an array of strings.
 *
 * @param contents - Array of strings to scan for URLs.
 * @returns Array of unique URLs found in the contents.
 */
export declare function extractUrls(contents: string[]): string[];
/**
 * Tool definition wrapping {@link extractUrls} for use with agents.
 */
export declare const extractUrlsTool: Tool<{
    contents: string[];
}>;
declare const _default: Tool<{
    contents: string[];
}>[];
export default _default;
