import { test, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  Ctx,
  GenerateOptions,
  LLM,
  Message,
  ModelResponse,
} from "@sisu-ai/core";
import { InMemoryKV, NullStream, SimpleTools, compose } from "@sisu-ai/core";
import { traceViewer } from "../src/index.js";

function makeCtx(): Ctx {
  const ac = new AbortController();
  const model: LLM = {
    name: "dummy",
    capabilities: {},
    generate: (async (
      _messages: Message[],
      _opts?: GenerateOptions,
    ): Promise<ModelResponse> =>
      ({
        message: { role: "assistant" as const, content: "ok" },
      }) satisfies ModelResponse) as LLM["generate"],
  };
  return {
    input: "hi",
    messages: [],
    model,
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  } as unknown as Ctx;
}

test("traceViewer writes json and html to path", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-test-"));
  try {
    const jsonPath = path.join(outDir, "tv-run.json");
    const writer = traceViewer({
      enable: true,
      path: jsonPath,
      style: "light",
    });
    const runner = async (ctx: Ctx) => {
      ctx.messages.push({ role: "assistant" as const, content: "ok" } as any);
    };
    await compose([writer, runner as any])(makeCtx());
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(jsonPath.replace(/\.json$/, ".html"))).toBe(true);
    const doc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(doc.meta.status).toBe("success");
    expect(typeof doc.meta.start).toBe("string");
    expect(typeof doc.meta.end).toBe("string");
    expect(typeof doc.meta.durationMs).toBe("number");

    const dir = path.dirname(jsonPath);
    const runsJsPath = path.join(dir, "runs.js");
    expect(fs.existsSync(runsJsPath)).toBe(true);
    const js = fs.readFileSync(runsJsPath, "utf8");
    const m = js.match(/SISU_RUN_INDEX\s*=\s*(\[[\s\S]*?\]);/);
    expect(m).toBeTruthy();
    const index = JSON.parse(m![1]);
    expect(Array.isArray(index)).toBe(true);
    expect(index.length).toBeGreaterThan(0);
    const entry = index[0];
    expect(typeof entry.id).toBe("string");
    expect(typeof entry.file).toBe("string");
    expect(typeof entry.title).toBe("string");
    expect(typeof entry.time).toBe("string");
    expect(typeof entry.status).toBe("string");
    expect(typeof entry.duration).toBe("number");
  } finally {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch {}
  }
});

test("traceViewer is enabled via --trace CLI and writes to custom traces dir", async () => {
  const origArgv = process.argv.slice();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-cli-"));
  try {
    process.argv = [process.argv[0], process.argv[1], "--trace"];
    const writer = traceViewer({ dir });
    await compose([writer])(makeCtx());
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const hasJson = entries.some((f) => /run-.*\.json$/.test(f));
    const hasHtml = entries.some((f) => /run-.*\.html$/.test(f));
    expect(hasJson && hasHtml).toBe(true);
  } finally {
    process.argv = origArgv;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

test("traceViewer supports html-only output", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-html-"));
  try {
    const htmlPath = path.join(dir, "html-only.html");
    await compose([
      traceViewer({ enable: true, path: htmlPath, html: true, json: false }),
    ])(makeCtx());
    expect(fs.existsSync(htmlPath)).toBe(true);
    expect(fs.existsSync(htmlPath.replace(/\.html$/, ".json"))).toBe(false);
    const runsJs = path.join(dir, "runs.js");
    expect(fs.existsSync(runsJs)).toBe(true);
    const js = fs.readFileSync(runsJs, "utf8");
    const m = js.match(/SISU_RUN_INDEX\s*=\s*(\[[\s\S]*?\]);/);
    expect(m).toBeTruthy();
    const idx = JSON.parse(m![1]);
    expect(Array.isArray(idx)).toBe(true);
    expect(idx.length).toBeGreaterThan(0);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

test("traceViewer supports json-only output", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-json-"));
  try {
    const jsonPath = path.join(dir, "json-only.json");
    await compose([
      traceViewer({ enable: true, path: jsonPath, html: false, json: true }),
    ])(makeCtx());
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(jsonPath.replace(/\.json$/, ".html"))).toBe(false);
    const runsJs = path.join(dir, "runs.js");
    expect(fs.existsSync(runsJs)).toBe(false);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

test("runs index skips malformed JSON traces", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-badjson-"));
  try {
    const bad = path.join(outDir, "run-20000101-000000.json");
    fs.writeFileSync(bad, '{"meta": { "start": "x" ', "utf8");

    const goodJson = path.join(outDir, "ok.json");
    await compose([
      traceViewer({ enable: true, path: goodJson, style: "light" }),
    ])(makeCtx());

    const runsJsPath = path.join(outDir, "runs.js");
    expect(fs.existsSync(runsJsPath)).toBe(true);
    const js = fs.readFileSync(runsJsPath, "utf8");
    const m = js.match(/SISU_RUN_INDEX\s*=\s*(\[[\s\S]*?\]);/);
    expect(m).toBeTruthy();
    const index = JSON.parse(m![1]);
    const hasBad = index.some(
      (e: any) =>
        e &&
        typeof e.file === "string" &&
        e.file.includes("run-20000101-000000.json"),
    );
    expect(hasBad).toBe(false);
  } finally {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch {}
  }
});

test("traceViewer uses usage events when meta usage missing", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-usage-"));
  try {
    const jsonPath = path.join(outDir, "usage.json");
    const mw = traceViewer({ enable: true, path: jsonPath, style: "light" });
    const runner = async (ctx: Ctx) => {
      (ctx.state as any)._tracePreamble = [
        {
          level: "info",
          args: [
            "[usage]",
            {
              promptTokens: 2,
              completionTokens: 3,
              totalTokens: 5,
              estCostUSD: 0.01,
              imageTokens: 1,
              imageCount: 1,
            },
          ],
        },
      ];
      ctx.messages.push({ role: "assistant" as const, content: "ok" } as any);
    };
    await compose([mw, runner as any])(makeCtx());
    const doc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(doc.meta.usage).toEqual({
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5,
      costUSD: 0.01,
      imageTokens: 1,
      imageCount: 1,
    });
  } finally {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch {}
  }
});

test("traceViewer captures error details from error-boundary state", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-error-"));
  try {
    const jsonPath = path.join(outDir, "err.json");
    const mw = traceViewer({ enable: true, path: jsonPath, style: "light" });
    const runner = async (ctx: Ctx) => {
      (ctx.state as any)._error = {
        name: "Boom",
        message: "fail",
        code: "E_FAIL",
      };
      ctx.messages.push({ role: "assistant" as const, content: "ok" } as any);
    };
    await compose([mw, runner as any])(makeCtx());
    const doc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(doc.meta.status).toBe("error");
    expect(doc.meta.error?.name).toBe("Boom");
    expect(doc.meta.error?.code).toBe("E_FAIL");
  } finally {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch {}
  }
});

test("traceViewer skips when http transport without spawned run", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-skip-"));
  try {
    const jsonPath = path.join(outDir, "skip.json");
    const mw = traceViewer({ enable: true, path: jsonPath, style: "light" });
    const ctx = makeCtx();
    ctx.state = { _transport: { type: "http" } } as any;
    await compose([mw])(ctx);
    expect(fs.existsSync(jsonPath)).toBe(false);
  } finally {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch {}
  }
});

test("traceViewer honors TRACE_HTML env to disable JSON output", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-env-"));
  const origHtml = process.env.TRACE_HTML;
  const origJson = process.env.TRACE_JSON;
  try {
    process.env.TRACE_HTML = "1";
    process.env.TRACE_JSON = "0";
    const jsonPath = path.join(outDir, "env.json");
    await compose([traceViewer({ enable: true, path: jsonPath })])(makeCtx());
    expect(fs.existsSync(jsonPath)).toBe(false);
    expect(fs.existsSync(jsonPath.replace(/\.json$/, ".html"))).toBe(true);
  } finally {
    process.env.TRACE_HTML = origHtml;
    process.env.TRACE_JSON = origJson;
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch {}
  }
});

test("traceViewer uses custom template when provided", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-template-"));
  try {
    const htmlPath = path.join(outDir, "custom.html");
    const template = vi.fn(() => "<html><body>custom</body></html>");
    await compose([traceViewer({ enable: true, path: htmlPath, template })])(
      makeCtx(),
    );
    expect(template).toHaveBeenCalled();
    const html = fs.readFileSync(htmlPath, "utf8");
    expect(html).toContain("custom");
  } finally {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch {}
  }
});
