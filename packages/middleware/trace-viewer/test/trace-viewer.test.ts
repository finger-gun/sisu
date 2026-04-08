import { test, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
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
    expect(doc.meta.fullTracePath).toBe(jsonPath);

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
    expect(entry.fullTracePath).toBe(jsonPath);
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
    expect(idx[0].fullTracePath).toBe(htmlPath);
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
    const doc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(doc.meta.fullTracePath).toBe(jsonPath);
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

test("traceViewer dashboard copies displayed full trace path", async () => {
  const { ids, runList, clipboardWrites } = bootstrapViewer({
    runs: [
      {
        id: "run-1",
        title: "Run 1",
        time: "2026-03-27T10:00:00.000Z",
        status: "success",
        duration: 10,
        model: "dummy",
        input: "hi",
        final: "ok",
        start: "2026-03-27T10:00:00.000Z",
        end: "2026-03-27T10:00:10.000Z",
        messages: [],
        events: [],
        fullTracePath: "/tmp/traces/run-1.json",
      },
    ],
  });

  const firstRun = runList.children[0];
  expect(firstRun).toBeTruthy();
  firstRun.dispatchEvent({ type: "click" });

  expect(ids.fullTracePathWrap.style.display).toBe("inline-flex");
  expect(ids.fullTracePath.textContent).toBe("/tmp/traces/run-1.json");

  ids.copyFullTracePath.dispatchEvent({ type: "click" });
  expect(clipboardWrites).toEqual(["/tmp/traces/run-1.json"]);
});

test("trace viewer dashboard tolerates runs without full trace path metadata", async () => {
  const { ids, runList, clipboardWrites } = bootstrapViewer({
    runs: [
      {
        id: "run-legacy",
        title: "Legacy run",
        time: "2026-03-27T10:00:00.000Z",
        status: "success",
        duration: 10,
        model: "dummy",
        input: "hi",
        final: "ok",
        start: "2026-03-27T10:00:00.000Z",
        end: "2026-03-27T10:00:10.000Z",
        messages: [],
        events: [],
      },
    ],
  });

  const firstRun = runList.children[0];
  expect(firstRun).toBeTruthy();
  firstRun.dispatchEvent({ type: "click" });

  expect(ids.fullTracePathWrap.style.display).toBe("none");
  expect(ids.copyFullTracePath.disabled).toBe(true);
  ids.copyFullTracePath.dispatchEvent({ type: "click" });
  expect(clipboardWrites).toEqual([]);
});

type FakeElement = ReturnType<typeof createFakeElement>;

function bootstrapViewer({
  runs,
}: {
  runs: Array<Record<string, unknown>>;
}) {
  const clipboardWrites: string[] = [];
  const ids = createViewerElements();
  const runList = ids.runList;
  const allElements = Object.values(ids);
  const document = {
    head: createFakeElement("head"),
    documentElement: createFakeElement("html"),
    createElement(tag: string) {
      const el = createFakeElement(tag);
      if (tag === "script") {
        Object.defineProperty(el, "src", {
          get() {
            return el._src || "";
          },
          set(value) {
            el._src = value;
          },
        });
      }
      return el;
    },
    getElementById(id: string) {
      return (ids as Record<string, FakeElement>)[id] || null;
    },
    querySelector(selector: string) {
      if (selector === "#eventsTable tbody") return ids.eventsTableBody;
      if (selector === "#roleTags .tag")
        return ids.roleTags.children.find((child) =>
          child.classList.contains("tag"),
        ) || null;
      if (selector === "#levelTags .tag")
        return ids.levelTags.children.find((child) =>
          child.classList.contains("tag"),
        ) || null;
      if (selector.startsWith("#")) return this.getElementById(selector.slice(1));
      if (selector === "[data-copy]") return null;
      if (selector === "[data-collapse]") return null;
      if (selector === "pre.code") return null;
      if (selector === ".role") return null;
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === ".run") return runList.children;
      if (selector === ".tag") {
        return [...ids.roleTags.children, ...ids.levelTags.children].filter(
          (child) => child.classList.contains("tag"),
        );
      }
      if (selector === "#levelTags .tag") return ids.levelTags.children;
      return allElements.filter((el) => el.matches(selector));
    },
    addEventListener() {},
  };

  const windowObj = {
    SISU_TRACES: { runs: [...runs], logo: "" },
    SISU_RUN_SCRIPTS: [],
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    matchMedia() {
      return { matches: false };
    },
    prompt() {
      return "";
    },
    navigator: {
      clipboard: {
        writeText(value: string) {
          clipboardWrites.push(value);
          return Promise.resolve();
        },
      },
      language: "en-US",
      languages: ["en-US"],
    },
    Intl,
    Blob,
    URL: {
      createObjectURL() {
        return "blob:trace";
      },
      revokeObjectURL() {},
    },
    setTimeout(fn: () => void) {
      fn();
      return 0;
    },
    clearTimeout() {},
  };
  const context = vm.createContext({
    window: windowObj,
    document,
    navigator: windowObj.navigator,
    localStorage: windowObj.localStorage,
    console,
    Intl,
    Blob,
    URL: windowObj.URL,
    setTimeout: windowObj.setTimeout,
    clearTimeout: windowObj.clearTimeout,
  });
  const source = fs.readFileSync(
    path.join(
      process.cwd(),
      "packages/middleware/trace-viewer/assets/viewer.js",
    ),
    "utf8",
  );
  vm.runInContext(source, context);
  return { ids, runList, clipboardWrites };
}

function createViewerElements() {
  const ids = {
    runList: createFakeElement("div"),
    runsCount: createFakeElement("span"),
    modelChip: createFakeElement("span"),
    statusChip: createFakeElement("span"),
    duration: createFakeElement("span"),
    startTime: createFakeElement("span"),
    endTime: createFakeElement("span"),
    fullTracePathWrap: createFakeElement("div"),
    fullTracePath: createFakeElement("span"),
    copyFullTracePath: createFakeElement("button"),
    errorDisplay: createFakeElement("div"),
    errorName: createFakeElement("span"),
    errorCode: createFakeElement("span"),
    errorMessage: createFakeElement("div"),
    errorContext: createFakeElement("div"),
    errorStack: createFakeElement("div"),
    inputPre: createFakeElement("pre"),
    finalPre: createFakeElement("pre"),
    roleTags: createFakeElement("div"),
    msgList: createFakeElement("div"),
    levelTags: createFakeElement("div"),
    eventsTable: createFakeElement("table"),
    eventsTableBody: createFakeElement("tbody"),
    accordion: createFakeElement("div"),
    lightBtn: createFakeElement("button"),
    darkBtn: createFakeElement("button"),
    localeSelect: createFakeElement("select"),
    runSearch: createFakeElement("input"),
    exportJson: createFakeElement("button"),
    selectionInfo: createFakeElement("div"),
    msgTpl: createFakeTemplate(),
    dateFrom: createFakeElement("input"),
    dateTo: createFakeElement("input"),
  };
  ids.eventsTable.appendChild(ids.eventsTableBody);
  ids.localeSelect.options = ids.localeSelect.children;
  ids.copyFullTracePath.textContent = "";
  ids.fullTracePathWrap.style.display = "none";
  return ids;
}

function createFakeTemplate() {
  const tpl = createFakeElement("template");
  tpl.content = {
    cloneNode() {
      const root = createFakeElement("div");
      const role = createFakeElement("span");
      role.classList.add("role");
      const actions = createFakeElement("div");
      const copy = createFakeElement("button");
      copy.dataset.copy = "";
      const collapse = createFakeElement("button");
      collapse.dataset.collapse = "";
      actions.appendChild(copy);
      actions.appendChild(collapse);
      const pre = createFakeElement("pre");
      pre.classList.add("code");
      root.querySelector = (selector: string) => {
        if (selector === ".role") return role;
        if (selector === "[data-copy]") return copy;
        if (selector === "[data-collapse]") return collapse;
        if (selector === "pre.code") return pre;
        return null;
      };
      return root;
    },
  };
  return tpl;
}

function createFakeElement(tagName: string) {
  const listeners = new Map<string, Array<(event?: any) => void>>();
  const classes = new Set<string>();
  const element = {
    tagName: tagName.toUpperCase(),
    children: [] as any[],
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    attributes: {} as Record<string, string>,
    className: "",
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    parentElement: null as any,
    content: null as any,
    _src: "",
    classList: {
      add(...names: string[]) {
        names.forEach((name) => classes.add(name));
        element.className = Array.from(classes).join(" ");
      },
      remove(...names: string[]) {
        names.forEach((name) => classes.delete(name));
        element.className = Array.from(classes).join(" ");
      },
      toggle(name: string, force?: boolean) {
        if (force === true || (!classes.has(name) && force !== false)) {
          classes.add(name);
          element.className = Array.from(classes).join(" ");
          return true;
        }
        classes.delete(name);
        element.className = Array.from(classes).join(" ");
        return false;
      },
      contains(name: string) {
        return classes.has(name);
      },
    },
    appendChild(child: any) {
      child.parentElement = element;
      element.children.push(child);
      if (element.tagName === "SELECT") element.options = element.children;
      if (
        element.tagName === "HEAD" &&
        child.tagName === "SCRIPT" &&
        typeof child.onload === "function"
      ) {
        child.onload();
      }
      return child;
    },
    prepend(child: any) {
      child.parentElement = element;
      element.children.unshift(child);
      if (element.tagName === "SELECT") element.options = element.children;
      return child;
    },
    remove() {
      if (!element.parentElement) return;
      const siblings = element.parentElement.children;
      const idx = siblings.indexOf(element);
      if (idx >= 0) siblings.splice(idx, 1);
    },
    setAttribute(name: string, value: string) {
      element.attributes[name] = value;
      if (name === "id") element.id = value;
      if (name.startsWith("data-")) element.dataset[name.slice(5)] = value;
    },
    addEventListener(type: string, handler: (event?: any) => void) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(event: any) {
      const evt =
        event && typeof event === "object" ? event : { type: String(event) };
      evt.target = evt.target || element;
      evt.preventDefault = evt.preventDefault || (() => {});
      evt.key = evt.key || "";
      const list = listeners.get(evt.type) || [];
      list.forEach((handler) => handler(evt));
    },
    querySelector(_selector: string) {
      return null;
    },
    querySelectorAll(_selector: string) {
      return [];
    },
    click() {
      element.dispatchEvent({ type: "click" });
    },
    focus() {},
    closest() {
      return null;
    },
    matches(selector: string) {
      if (selector.startsWith("#")) return element.id === selector.slice(1);
      if (selector.startsWith(".")) return classes.has(selector.slice(1));
      return false;
    },
  } as any;
  return element;
}
