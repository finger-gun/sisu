// AbortController/AbortSignal are globals in runtime environments
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import {
  InMemoryKV,
  type Agent,
  type Middleware,
  type Memory,
  type ModelEvent,
  type LLM,
  type GenerateOptions,
  type Message,
  type ModelResponse,
  type Ctx,
} from "@sisu-ai/core";
import { matchRoute } from "@sisu-ai/server";
import type { IncomingMessage, ServerResponse } from "http";
import { setImmediate } from "node:timers";

type StartRoute = {
  path: string; // e.g. '/runs/support-ticket'
  pipeline?: string;
  transform?: (
    req: IncomingMessage,
    body: unknown,
  ) =>
    | Promise<{ input: unknown; options?: Record<string, unknown> }>
    | { input: unknown; options?: Record<string, unknown> };
};

export interface AgentRunApiOptions {
  basePath?: string;
  apiKey?: string;
  maxBodyBytes?: number;
  runStore?: Memory;
  routes?: Array<StartRoute>;
}

export interface HttpCtx extends Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  agent: Agent<HttpCtx>;
  signal: AbortSignal;
}

interface RunRecord {
  id: string;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelling"
    | "cancelled";
  startedAt: number;
  updatedAt: number;
  result?: unknown;
  error?: string;
  emitter: EventEmitter;
  controller: AbortController;
  pipeline?: string;
}

export function agentRunApi(
  opts: AgentRunApiOptions = {},
): Middleware<HttpCtx> {
  const basePath = opts.basePath ?? "/api";
  const runStore: Memory = opts.runStore ?? new InMemoryKV();
  const maxBody = opts.maxBodyBytes ?? 1_000_000; // 1MB default

  const customStartPaths = new Map<
    string,
    { pipeline?: string; transform?: StartRoute["transform"] }
  >();
  for (const r of opts.routes ?? []) {
    if (!r.path.startsWith("/"))
      throw new Error(`agentRunApi route path must start with '/': ${r.path}`);
    customStartPaths.set(`${basePath}${r.path}`, {
      pipeline: r.pipeline,
      transform: r.transform,
    });
  }
  const endpoints: string[] = [
    `POST ${basePath}/runs/start`,
    `GET  ${basePath}/runs/:id/status`,
    `GET  ${basePath}/runs/:id/stream`,
    `POST ${basePath}/runs/:id/cancel`,
    ...Array.from(customStartPaths.keys()).map((p) => `POST ${p}`),
  ];

  const mw: Middleware<HttpCtx> = async (ctx, next) => {
    const { req, res } = ctx;
    const url = req.url || "";
    if (!url.startsWith(basePath)) {
      return next();
    }

    if (opts.apiKey) {
      const auth = req.headers["authorization"];
      if (auth !== `Bearer ${opts.apiKey}`) {
        res.statusCode = 401;
        res.end();
        return;
      }
    }

    // Common: read body for POSTs
    const readJsonBody = async (): Promise<unknown> => {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > maxBody) return { __tooLarge: true };
        chunks.push(chunk as Buffer);
      }
      if (chunks.length === 0) return undefined;
      try {
        return JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        return { __invalidJson: true };
      }
    };

    const startRun = async (
      initial: { input?: unknown; options?: Record<string, unknown> },
      pipeline?: string,
    ) => {
      const runId = randomUUID();
      const controller = new AbortController();
      const run: RunRecord = {
        id: runId,
        status: "queued",
        startedAt: Date.now(),
        updatedAt: Date.now(),
        emitter: new EventEmitter(),
        controller,
        pipeline,
      };
      await runStore.set(runId, run);
      res.statusCode = 202;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ runId, status: run.status }));

      const handler = ctx.agent.handler();
      setImmediate(async () => {
        run.status = "running";
        run.updatedAt = Date.now();
        run.emitter.emit("status", { status: run.status });
        await runStore.set(runId, run);
        const runCtx: HttpCtx = {
          ...ctx,
          req: {
            url: "",
            headers: {},
            method: "POST",
          } as IncomingMessage,
          res: undefined as unknown as ServerResponse,
          input: typeof initial.input === "string" ? initial.input : undefined,
          signal: controller.signal,
        };
        // Ensure state exists and attach pipeline/options hint for downstream routing
        runCtx.state = { ...(ctx.state ?? {}) };
        // Mark this as an internal spawned run (not the HTTP envelope)
        runCtx.state._transport = { type: "internal" };
        runCtx.state.agentRun = {
          ...(runCtx.state.agentRun ?? {}),
          pipeline,
          options: initial.options,
          spawned: true,
          runId,
          route: url,
        } as Record<string, unknown>;
        // Seed a small trace preamble so the spawned run trace shows how it started
        const http = ctx.state?._http as
          | { method?: string; url?: string }
          | undefined;
        const nowIso = new Date().toISOString();
        runCtx.state._tracePreamble = [
          {
            ts: nowIso,
            level: "info",
            args: ["[server] http", { method: http?.method, url: http?.url }],
          },
          {
            ts: nowIso,
            level: "info",
            args: ["[agent-run-api] run", { runId, pipeline, route: url }],
          },
        ] as Array<{ ts: string; level: string; args: unknown[] }>;
        // Forward streaming token events from the model to the run emitter so SSE clients can receive live tokens.
        if (runCtx.model && typeof runCtx.model.generate === "function") {
          const origGenerate = runCtx.model.generate.bind(runCtx.model);
          const wrappedGenerate = (
            messages: Message[],
            opts?: GenerateOptions,
          ): Promise<ModelResponse> | AsyncIterable<ModelEvent> => {
            const res = origGenerate(messages, opts);
            if (
              res &&
              typeof (res as unknown as AsyncIterable<ModelEvent>)[
                Symbol.asyncIterator
              ] === "function"
            ) {
              const src = res as unknown as AsyncIterable<ModelEvent>;
              const tee = async function* () {
                for await (const ev of src) {
                  if (ev?.type === "token" && ev.token)
                    run.emitter.emit("token", { token: ev.token });
                  yield ev;
                }
              };
              return tee();
            }
            return res as Promise<ModelResponse>;
          };
          runCtx.model = {
            ...runCtx.model,
            generate: wrappedGenerate as unknown as LLM["generate"],
          };
        }
        try {
          await handler(runCtx);
          if (controller.signal.aborted) {
            run.status = "cancelled";
            run.updatedAt = Date.now();
            run.emitter.emit("status", { status: run.status });
          } else {
            const final = runCtx.messages
              ?.filter((m) => m.role === "assistant")
              .pop();
            run.status = "succeeded";
            run.result = final?.content;
            run.updatedAt = Date.now();
            run.emitter.emit("status", { status: run.status });
            run.emitter.emit("final", { result: run.result });
          }
          await runStore.set(runId, run);
        } catch (err) {
          if (controller.signal.aborted) {
            run.status = "cancelled";
            run.emitter.emit("status", { status: run.status });
          } else {
            run.status = "failed";
            run.error = err instanceof Error ? err.message : String(err);
            run.emitter.emit("error", { message: run.error });
          }
          run.updatedAt = Date.now();
          await runStore.set(runId, run);
        }
      });
    };

    // Handle POST start for default and custom routes
    if (
      req.method === "POST" &&
      (url === `${basePath}/runs/start` || customStartPaths.has(url))
    ) {
      const body = await readJsonBody();
      if ((body as { __tooLarge?: boolean })?.__tooLarge) {
        res.statusCode = 413;
        res.end(JSON.stringify({ error: "body_too_large" }));
        return;
      }
      if ((body as { __invalidJson?: boolean })?.__invalidJson) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "invalid_json" }));
        return;
      }

      const custom = customStartPaths.get(url);
      if (custom) {
        try {
          const v = custom.transform
            ? await custom.transform(req, body)
            : { input: (body as { input?: unknown })?.input };
          const x: { input: unknown; options?: Record<string, unknown> } =
            typeof v === "object" && v && "input" in v
              ? (v as { input: unknown; options?: Record<string, unknown> })
              : { input: undefined };
          if (typeof x.input === "undefined" || x.input === null) {
            res.statusCode = 422;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "missing_input" }));
            ctx.log?.info?.("[agent-run-api] missing input on custom route", {
              path: url,
            });
            return;
          }
          await startRun(
            { input: x.input, options: x.options },
            custom.pipeline,
          );
        } catch (e) {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error: "invalid_request",
              message: e instanceof Error ? e.message : String(e),
            }),
          );
          ctx.log?.warn?.("[agent-run-api] custom transform error", {
            path: url,
            message: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }
      const defaultInput = (body as { input?: unknown })?.input;
      if (typeof defaultInput === "undefined" || defaultInput === null) {
        res.statusCode = 422;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "missing_input" }));
        ctx.log?.info?.("[agent-run-api] missing input on default start");
        return;
      }
      await startRun({ input: defaultInput });
      return;
    }

    // GET /runs/:id/status
    const statusMatch = matchRoute(url, basePath, "/runs/:id/status");
    if (req.method === "GET" && statusMatch) {
      const run = await runStore.get<RunRecord>(statusMatch.params.id);
      if (!run) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      const { emitter, controller, ...data } = run;
      void emitter;
      void controller;
      res.end(
        JSON.stringify({
          runId: data.id,
          status: data.status,
          startedAt: data.startedAt,
          updatedAt: data.updatedAt,
          result: data.result,
          error: data.error,
          pipeline: data.pipeline,
        }),
      );
      return;
    }

    // GET /runs/:id/stream
    const streamMatch = matchRoute(url, basePath, "/runs/:id/stream");
    if (req.method === "GET" && streamMatch) {
      const run = await runStore.get<RunRecord>(streamMatch.params.id);
      if (!run) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      const onStatus = (s: unknown) => send("status", s);
      const onToken = (t: unknown) => send("token", t);
      const onFinal = (d: unknown) => {
        send("final", d);
        cleanup();
        res.end();
      };
      const onError = (e: unknown) => {
        send("error", e);
        cleanup();
        res.end();
      };
      const cleanup = () => {
        run.emitter.off("status", onStatus);
        run.emitter.off("token", onToken);
        run.emitter.off("final", onFinal);
        run.emitter.off("error", onError);
      };
      run.emitter.on("status", onStatus);
      run.emitter.on("token", onToken);
      run.emitter.on("final", onFinal);
      run.emitter.on("error", onError);
      send("status", { status: run.status });
      // If run already finished, replay the terminal event immediately
      if (run.status === "succeeded" && typeof run.result !== "undefined") {
        onFinal({ result: run.result });
        return;
      }
      if (run.status === "failed" && run.error) {
        onError({ message: run.error });
        return;
      }
      if (run.status === "cancelled") {
        onStatus({ status: run.status });
        cleanup();
        res.end();
        return;
      }
      req.on("close", cleanup);
      return;
    }

    // POST /runs/:id/cancel
    const cancelMatch = matchRoute(url, basePath, "/runs/:id/cancel");
    if (req.method === "POST" && cancelMatch) {
      const run = await runStore.get<RunRecord>(cancelMatch.params.id);
      if (!run) {
        res.statusCode = 404;
        res.end();
        return;
      }
      // Do not overwrite terminal states
      if (
        run.status === "succeeded" ||
        run.status === "failed" ||
        run.status === "cancelled"
      ) {
        res.statusCode = 409;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({ error: "run_not_cancellable", status: run.status }),
        );
        return;
      }
      // If already cancelling, just echo state
      if (run.status === "cancelling") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ runId: run.id, status: run.status }));
        return;
      }
      // queued or running: request abort and mark cancelling
      run.controller.abort();
      run.status = "cancelling";
      run.updatedAt = Date.now();
      run.emitter.emit("status", { status: run.status });
      await runStore.set(run.id, run);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ runId: run.id, status: run.status }));
      return;
    }

    await next();
  };
  (mw as Middleware<HttpCtx> & { bannerEndpoints?: string[] }).bannerEndpoints =
    endpoints;
  return mw;
}
