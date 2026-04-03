import type { Tool, ToolContext } from "@sisu-ai/core";
import { firstConfigValue } from "@sisu-ai/core";
import { LinkupClient } from "linkup-sdk";
import type { SearchParams } from "linkup-sdk";
import { z } from "zod";

export type LinkupSearchDepth = "standard" | "deep";
export type LinkupOutputType = "searchResults" | "sourcedAnswer" | "structured";

const linkupSearchSchema = z
  .object({
    query: z.string().min(1),
    depth: z.enum(["standard", "deep"]).optional(),
    outputType: z
      .enum(["searchResults", "sourcedAnswer", "structured"])
      .optional(),
    includeImages: z.boolean().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    includeDomains: z.array(z.string().min(1)).optional(),
    excludeDomains: z.array(z.string().min(1)).optional(),
    includeInlineCitations: z.boolean().optional(),
    includeSources: z.boolean().optional(),
    maxResults: z.number().int().positive().optional(),
    structuredOutputSchema: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.outputType === "structured" && !value.structuredOutputSchema) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["structuredOutputSchema"],
        message: "structuredOutputSchema is required when outputType=structured",
      });
    }
  });

export type LinkupWebSearchArgs = z.infer<typeof linkupSearchSchema>;

export type LinkupSearchResult =
  | { results: unknown[] }
  | { answer: string; sources: unknown[] }
  | Record<string, unknown>;

type LinkupDeps = {
  apiKey?: unknown;
  baseUrl?: unknown;
};

function resolveLinkupConfig(ctx: ToolContext): { apiKey: string; baseUrl?: string } {
  const deps = (ctx?.deps ?? {}) as Record<string, unknown>;
  const linkupDeps = (deps.linkup ?? {}) as LinkupDeps;
  const depApiKey =
    typeof linkupDeps.apiKey === "string"
      ? linkupDeps.apiKey
      : typeof deps.apiKey === "string"
        ? deps.apiKey
        : undefined;
  const apiKey =
    depApiKey ||
    firstConfigValue(["LINKUP_API_KEY"]) ||
    firstConfigValue(["API_KEY"]);
  if (!apiKey) {
    throw new Error("Missing LINKUP_API_KEY or API_KEY");
  }

  const depBaseUrl =
    typeof linkupDeps.baseUrl === "string"
      ? linkupDeps.baseUrl
      : typeof deps.baseUrl === "string"
        ? deps.baseUrl
        : undefined;
  const envBaseUrl = firstConfigValue(["LINKUP_BASE_URL"]);
  const baseUrl = depBaseUrl || envBaseUrl;

  return { apiKey, baseUrl };
}

export const linkupWebSearch: Tool<LinkupWebSearchArgs, LinkupSearchResult> = {
  name: "webSearch",
  description: "Search the web using LinkUp's search API.",
  schema: linkupSearchSchema,
  handler: async (args: LinkupWebSearchArgs, ctx: ToolContext) => {
    const normalized = linkupSearchSchema.parse(args);
    const { apiKey, baseUrl } = resolveLinkupConfig(ctx);

    const client = new LinkupClient({ apiKey, baseUrl });
    const outputType = normalized.outputType ?? "searchResults";

    const commonRequest = {
      query: normalized.query,
      depth: normalized.depth ?? "standard",
      includeImages: normalized.includeImages,
      fromDate: normalized.fromDate,
      toDate: normalized.toDate,
      includeDomains: normalized.includeDomains,
      excludeDomains: normalized.excludeDomains,
      maxResults: normalized.maxResults,
    };
    let request: SearchParams;
    if (outputType === "structured") {
      request = {
        ...commonRequest,
        outputType: "structured",
        includeSources: normalized.includeSources,
        structuredOutputSchema: normalized.structuredOutputSchema!,
      };
    } else if (outputType === "sourcedAnswer") {
      request = {
        ...commonRequest,
        outputType: "sourcedAnswer",
        includeInlineCitations: normalized.includeInlineCitations,
      };
    } else {
      request = {
        ...commonRequest,
        outputType: "searchResults",
      };
    }

    try {
      const response = await client.search(request);
      return response as LinkupSearchResult;
    } catch (error) {
      throw new Error(
        `LinkUp web search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

export default linkupWebSearch;
