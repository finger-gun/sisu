import type { Middleware } from '@sisu-ai/core';
export interface ContextCompressorOptions {
    maxChars?: number;
    keepRecent?: number;
    summaryMaxChars?: number;
}
export declare const contextCompressor: (opts?: ContextCompressorOptions) => Middleware;
