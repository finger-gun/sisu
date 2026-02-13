import type { Tool, ToolContext, Message, ModelResponse } from "@sisu-ai/core";
import { z } from "zod";

export type TargetLength = "short" | "medium" | "long";

export interface SummarizeArgs {
  text: string;
  target?: TargetLength; // default medium
  maxChars?: number; // hard cap for output
  bullets?: boolean; // output as bullets
  includeCitations?: boolean; // preserve / collect URLs
  focus?: string; // guidance
}

export interface SummarizeResult {
  summary: string;
  urls?: string[];
}

export const summarizeText: Tool<SummarizeArgs> = {
  name: "summarizeText",
  description:
    "Summarize a block of text using the current model. Useful for condensing large webFetch outputs while keeping key facts and URLs.",
  schema: z.object({
    text: z.string().min(1),
    target: z.enum(["short", "medium", "long"]).optional(),
    maxChars: z.number().int().positive().max(50_000).optional(),
    bullets: z.boolean().optional(),
    includeCitations: z.boolean().optional(),
    focus: z.string().optional(),
  }),
  handler: async (
    { text, target = "medium", maxChars, bullets, includeCitations, focus },
    ctx: ToolContext,
  ): Promise<SummarizeResult> => {
    const cap = Math.min(Math.max(Number(maxChars ?? 2000), 200), 50_000);
    const chunks = chunkText(text, 10_000);
    const chunkSummaries: string[] = [];
    for (const [i, ch] of chunks.entries()) {
      // Allocate characters per chunk, allowing a buffer of 200, but not exceeding the cap
      const charsPerChunk = Math.min(
        Math.floor(cap / Math.max(chunks.length, 1)) + 200,
        cap,
      );
      const prompt = buildPrompt(
        ch,
        target,
        charsPerChunk,
        bullets,
        includeCitations,
        focus,
        `Part ${i + 1}/${chunks.length}`,
      );
      const res = (await ctx.model.generate(prompt, {
        toolChoice: "none",
        signal: ctx.signal,
      })) as ModelResponse;
      const s = String(res?.message?.content ?? "").trim();
      if (s) chunkSummaries.push(s.slice(0, cap));
    }
    const combinedInput = chunkSummaries.join("\n\n");
    const finalPrompt = buildPrompt(
      combinedInput || text,
      target,
      cap,
      bullets,
      includeCitations,
      focus,
      "Final Synthesis",
    );
    const res = (await ctx.model.generate(finalPrompt, {
      toolChoice: "none",
      signal: ctx.signal,
    })) as ModelResponse;
    const summary = String(res?.message?.content ?? "").slice(0, cap);
    const urls = includeCitations ? extractUrls([summary]) : undefined;
    return { summary, ...(urls && urls.length ? { urls } : {}) };
  },
};

export default summarizeText;

function buildPrompt(
  text: string,
  target: TargetLength,
  maxChars: number,
  bullets?: boolean,
  includeCitations?: boolean,
  focus?: string,
  label?: string,
): Message[] {
  const aims: string[] = [];
  aims.push(`Keep under ${maxChars} characters.`);
  if (bullets) aims.push("Prefer concise bullet points.");
  if (includeCitations)
    aims.push("Preserve any URLs as citations when relevant.");
  if (focus) aims.push(`Emphasize: ${focus}`);
  const density =
    target === "short"
      ? "High compression"
      : target === "long"
        ? "Low compression"
        : "Balanced compression";
  const sys = `You are a careful summarizer. ${density}. Do not invent facts. If URLs are present, keep them.`;
  const usr = `${label ? `[${label}] ` : ""}Summarize the following text.\n\n${text}`;
  const guide = aims.length ? `Guidelines: ${aims.join(" ")}\n` : "";
  return [
    { role: "system", content: sys },
    { role: "user", content: `${guide}${usr}` },
  ];
}

function chunkText(s: string, size = 10_000): string[] {
  if (s.length <= size) return [s];
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    out.push(s.slice(i, i + size));
    i += size;
  }
  return out;
}

function extractUrls(contents: string[]): string[] {
  /**
   * Regular expression to match URLs starting with "http://" or "https://".
   *
   * This pattern matches any substring that:
   * - Begins with "http://" or "https://"
   * - Is followed by any sequence of characters except whitespace, closing parentheses, square brackets, double quotes, single quotes, greater-than signs, or angle brackets.
   *
   * Excluded characters (`\s)\]"'>`) are commonly found at the end of URLs in text (such as punctuation or delimiters) and are not considered part of the URL.
   *
   * @remarks
   * While this regex works for many common cases, URL parsing can be complex and edge cases may not be handled correctly.
   * For more robust and accurate URL extraction, we should consider using a dedicated URL parsing library.
   */
  const urlRe = /https?:\/\/[^\s)\]"'>]+/gi;
  const out = new Set<string>();
  for (const c of contents) for (const m of c.matchAll(urlRe)) out.add(m[0]);
  return Array.from(out);
}
