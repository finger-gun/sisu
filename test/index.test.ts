import { describe, it, expect, vi } from "vitest";
import { sisu } from "../src/index";

vi.mock("../src/request", () => ({
  request: vi.fn().mockResolvedValue({"id":"gen-1756333451-cPp53ItAkOxplxIj0aHz","provider":"OpenAI","model":"openai/gpt-4o-mini","object":"chat.completion","created":1756333451,"choices":[{"logprobs":null,"finish_reason":"stop","native_finish_reason":"stop","index":0,"message":{"role":"assistant","content":"The capital of France is Paris.","refusal":null,"reasoning":null}}],"system_fingerprint":"fp_560af6e559","usage":{"prompt_tokens":14,"completion_tokens":7,"total_tokens":21,"prompt_tokens_details":{"cached_tokens":0,"audio_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}}}),
}));

describe("hello", () => {
  it("greets by default", () => {
    const config = { model: "default-model", system: "Hello, world!" };
    const client = sisu(config);
    expect(client.request("What is the capital of France?")).resolves.toEqual({"id":"gen-1756333451-cPp53ItAkOxplxIj0aHz","provider":"OpenAI","model":"openai/gpt-4o-mini","object":"chat.completion","created":1756333451,"choices":[{"logprobs":null,"finish_reason":"stop","native_finish_reason":"stop","index":0,"message":{"role":"assistant","content":"The capital of France is Paris.","refusal":null,"reasoning":null}}],"system_fingerprint":"fp_560af6e559","usage":{"prompt_tokens":14,"completion_tokens":7,"total_tokens":21,"prompt_tokens_details":{"cached_tokens":0,"audio_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}}});
  });
});