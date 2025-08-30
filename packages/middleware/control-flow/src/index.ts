import { compose, type Ctx, type Middleware } from '@sisu-ai/core';

type Pred<C extends Ctx = Ctx> = (ctx: C) => boolean | Promise<boolean>;

export const sequence = <C extends Ctx>(parts: Array<Middleware<C>>): Middleware<C> => {
  const run = compose<C>(parts as Array<Middleware<C>>);
  return async (ctx, next) => { await run(ctx); await next(); };
};

export const branch = <C extends Ctx>(predicate: Pred<C>, onTrue: Middleware<C>, onFalse?: Middleware<C>): Middleware<C> => {
  const runTrue = compose<C>([onTrue]);
  const runFalse = compose<C>([onFalse ?? (async () => {}) as Middleware<C>]);
  return async (ctx, next) => {
    const cond = await predicate(ctx);
    ctx.log.debug?.('[control-flow/branch] predicate', { result: cond });
    if (cond) await runTrue(ctx); else await runFalse(ctx);
    await next();
  };
};

export const switchCase = <C extends Ctx>(select: (ctx: C) => string | Promise<string>, routes: Record<string, Middleware<C>>, fallback?: Middleware<C>): Middleware<C> => {
  const runners: Record<string, (ctx: C, next?: () => Promise<void>) => Promise<void>> = {};
  for (const [k, mw] of Object.entries(routes)) runners[k] = compose<C>([mw]);
  const runFallback = compose<C>([fallback ?? (async () => {}) as Middleware<C>]);
  return async (ctx, next) => { const key = await select(ctx); ctx.log.debug?.('[control-flow/switchCase] route', { route: key }); const run = runners[key] ?? runFallback; await run(ctx); await next(); };
};

export const loopWhile = <C extends Ctx>(predicate: Pred<C>, body: Middleware<C>, opts: { max?: number } = {}): Middleware<C> => {
  const runBody = compose<C>([body]); const max = opts.max ?? 8;
  return async (ctx, next) => { let i=0; while (await predicate(ctx)) { if (ctx.signal.aborted) break; ctx.log.debug?.('[control-flow/loopWhile] iteration', { i }); await runBody(ctx); if (++i>=max) break; } await next(); };
};

export const loopUntil = <C extends Ctx>(done: Pred<C>, body: Middleware<C>, opts: { max?: number } = {}): Middleware<C> => {
  const runBody = compose<C>([body]);
  const max = opts.max ?? 8;
  return async (ctx, next) => {
    let i = 0;
    do {
      if (ctx.signal.aborted) break;
      await runBody(ctx);
      if (++i >= max) break;
    } while (!(await done(ctx)));
    await next();
  };
};

export const parallel = <C extends Ctx>(branches: Array<Middleware<C>>, merge?: (ctx: C, forks: C[]) => void | Promise<void>): Middleware<C> => {
  const runners = branches.map(b => compose<C>([b]));
  return async (ctx, next) => {
    const forks = runners.map(() => ({ ...ctx, messages: ctx.messages.slice(), state: { ...ctx.state } } as C));
    await Promise.all(forks.map((c, i) => runners[i](c)));
    if (merge) await merge(ctx, forks as C[]);
    await next();
  };
};

export type NodeId = string; export type Edge<C extends Ctx> = { from: NodeId; to: NodeId; when?: Pred<C> }; export type Node<C extends Ctx> = { id: NodeId; run: Middleware<C> };

export const graph = <C extends Ctx>(nodes: Node<C>[], edges: Edge<C>[], start: NodeId): Middleware<C> => {
  const nodeMap = new Map<NodeId, (ctx: C, next?: () => Promise<void>) => Promise<void>>(
    nodes.map(n=>[n.id, compose<C>([n.run])])
  );
  const nextRecord = edges.reduce((acc, e) => { (acc[e.from] ||= []).push(e); return acc; }, {} as Record<string, Edge<C>[]>);
  const nexts = new Map<NodeId, Edge<C>[]>(Object.entries(nextRecord) as Array<[NodeId, Edge<C>[]]>);
  return async (ctx, next) => {
    let cur: NodeId | undefined = start; let guards=0;
    while (cur) {
      if (++guards > 128) throw new Error('graph executor: step limit exceeded');
      const run = nodeMap.get(cur); if (!run) throw new Error('graph: missing node '+cur);
      ctx.log.debug?.('[control-flow/graph] node', { id: cur });
      await run(ctx);
      const candidates: Edge<C>[] = nexts.get(cur) ?? [];
      let advanced = false;
      for (const e of candidates as Edge<C>[]) { if (!e.when || await e.when(ctx)) { cur = e.to; advanced = true; break; } }
      if (!advanced) cur = undefined; if (ctx.signal.aborted) break;
    }
    await next();
  };
};
