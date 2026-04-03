import { afterEach, expect, test, vi } from "vitest";
import type { ToolContext } from "@sisu-ai/core";

const { clientCtorMock, searchMock } = vi.hoisted(() => ({
  clientCtorMock: vi.fn(),
  searchMock: vi.fn(),
}));

vi.mock("linkup-sdk", () => ({
  LinkupClient: vi.fn().mockImplementation((config: unknown) => {
    clientCtorMock(config);
    return { search: searchMock };
  }),
}));

import { linkupWebSearch } from "../src/index.js";

const makeCtx = (deps?: Record<string, unknown>): ToolContext =>
  ({
    model: { name: "openai:gpt-4o-mini" },
    log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    signal: new AbortController().signal,
    memory: { get: vi.fn(), set: vi.fn() },
    deps,
  }) as unknown as ToolContext;

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.LINKUP_API_KEY;
  delete process.env.LINKUP_BASE_URL;
  delete process.env.API_KEY;
});

test("linkupWebSearch uses defaults and env key when only query is provided", async () => {
  process.env.LINKUP_API_KEY = "env-key";
  searchMock.mockResolvedValueOnce({ results: [{ name: "A" }] });

  const result = await linkupWebSearch.handler(
    { query: "latest ai news" } as never,
    makeCtx(),
  );

  expect(clientCtorMock).toHaveBeenCalledWith({
    apiKey: "env-key",
    baseUrl: undefined,
  });
  expect(searchMock).toHaveBeenCalledWith(
    expect.objectContaining({
      query: "latest ai news",
      depth: "standard",
      outputType: "searchResults",
    }),
  );
  expect(result).toEqual({ results: [{ name: "A" }] });
});

test("linkupWebSearch prefers injected deps over env values", async () => {
  process.env.LINKUP_API_KEY = "env-key";
  process.env.LINKUP_BASE_URL = "https://env.linkup.test";
  searchMock.mockResolvedValueOnce({ answer: "ok", sources: [] });

  await linkupWebSearch.handler(
    {
      query: "microsoft revenue",
      depth: "deep",
      outputType: "sourcedAnswer",
      includeInlineCitations: true,
      maxResults: 6,
    } as never,
    makeCtx({
      linkup: { apiKey: "deps-key", baseUrl: "https://deps.linkup.test" },
    }),
  );

  expect(clientCtorMock).toHaveBeenCalledWith({
    apiKey: "deps-key",
    baseUrl: "https://deps.linkup.test",
  });
  expect(searchMock).toHaveBeenCalledWith(
    expect.objectContaining({
      query: "microsoft revenue",
      depth: "deep",
      outputType: "sourcedAnswer",
      includeInlineCitations: true,
      maxResults: 6,
    }),
  );
});

test("linkupWebSearch supports structured output requests", async () => {
  process.env.API_KEY = "generic-key";
  searchMock.mockResolvedValueOnce({ company: "Microsoft", revenue: 245100000000 });

  await linkupWebSearch.handler(
    {
      query: "What is Microsoft's 2024 revenue?",
      outputType: "structured",
      structuredOutputSchema: {
        type: "object",
        properties: {
          company: { type: "string" },
          revenue: { type: "number" },
        },
      },
      includeSources: true,
      fromDate: "2024-01-01",
      toDate: "2024-12-31",
    } as never,
    makeCtx(),
  );

  const callArg = searchMock.mock.calls[0]?.[0] as {
    fromDate?: Date;
    toDate?: Date;
    outputType?: string;
    includeSources?: boolean;
  };
  expect(callArg.outputType).toBe("structured");
  expect(callArg.includeSources).toBe(true);
  expect(callArg.fromDate).toBeInstanceOf(Date);
  expect(callArg.toDate).toBeInstanceOf(Date);
});

test("linkupWebSearch throws on missing API key", async () => {
  await expect(
    linkupWebSearch.handler({ query: "test" } as never, makeCtx()),
  ).rejects.toThrow(/Missing LINKUP_API_KEY or API_KEY/);
});

test("linkupWebSearch throws on invalid structured request", async () => {
  process.env.LINKUP_API_KEY = "env-key";
  await expect(
    linkupWebSearch.handler(
      { query: "x", outputType: "structured" } as never,
      makeCtx(),
    ),
  ).rejects.toThrow(/structuredOutputSchema is required/);
});

test("linkupWebSearch wraps provider errors", async () => {
  process.env.LINKUP_API_KEY = "env-key";
  searchMock.mockRejectedValueOnce(new Error("rate limit"));

  await expect(
    linkupWebSearch.handler({ query: "x" } as never, makeCtx()),
  ).rejects.toThrow(/LinkUp web search failed: rate limit/);
});
