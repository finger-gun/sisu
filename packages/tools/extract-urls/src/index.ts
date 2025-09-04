import type { Tool } from '@sisu-ai/core';
import { z } from 'zod';

/**
 * Extract all unique URLs from an array of strings.
 *
 * @param contents - Array of strings to scan for URLs.
 * @returns Array of unique URLs found in the contents.
 */
export function extractUrls(contents: string[]): string[] {
  const urlRe = /https?:\/\/[\S)\]\"'>]+/gi;
  const out = new Set<string>();
  for (const c of contents) for (const m of c.matchAll(urlRe)) out.add(m[0]);
  return Array.from(out);
}

/**
 * Tool definition wrapping {@link extractUrls} for use with agents.
 */
export const extractUrlsTool: Tool<{ contents: string[] }> = {
  name: 'extractUrls',
  description: 'Extract unique HTTP/HTTPS URLs from provided text snippets.',
  schema: z.object({ contents: z.array(z.string()) }),
  handler: async ({ contents }) => extractUrls(contents),
};

export default [extractUrlsTool];
