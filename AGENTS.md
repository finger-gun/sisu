# AGENTS Guidelines for This Repository

## Dev environment tips
- Run `rm -rf package-lock.json` in project root is needed due to a bug in rollup dependency if you are running Linux you need to first remove the package-lock file before you build the project to use teh dependency platform native binaries.
- Then run
`npm install` and `npm run build -ws`to install dependencies and build the workspace
- Now it is possible to run any on the examples in /examples, run commands can be found as scripts in `package.json` project root.
- You find project documentation and intent in README.md, there is one overview in the root of project and then specific README.md for each package. Packages are core, middleware, adapters or tools.

## Testing instructions
- Find the CI plan in the .github/workflows folder.
- Run `rm -rf package-lock.json` in project root is needed due to a bug in rollup dependency if you are running Linux you need to first remove the package-lock file before you build the project to use teh dependency platform native binaries.
- Then run `npm install` and `npm run build -ws`to install dependencies and build the workspace
- From the project root you can just call `npm run test:coverage` to run all tests and see coverage, we have a target of 80% (we use vitest).
- To focus on one step, add the Vitest pattern: `pnpm vitest run -t "<test name>"`.
- Fix any test or type errors until the whole suite is green.
- Add or update tests for the code you change, even if nobody asked.

## Code guidelines
here’s a concise **Code Guidelines** section you can drop into `AGENTS.md`.

---

## Code Guidelines (TypeScript)

**Philosophy:** small, explicit, composable. Favor simple, testable building blocks (middleware, tools, adapters) over monoliths.

### 1) Language & Linting

* Use **TypeScript** in **strict** mode. Avoid `any`; prefer `unknown` + narrowing.
* ESLint: follow the repo’s **recommended** rules. Fix all `--max-warnings=0`.
* Prefer **named exports** from each package; keep `default` exports for React-only files (if any).


### 3) Types & APIs

* Prefer **`type`** for unions/aliases, **`interface`** for object contracts that may be extended.
* Public API should be **stable and minimal**. Mark internal helpers `/** @internal */`.

### 4) Middleware Conventions

* Middleware signature: `(ctx, next) => Promise<void>`.
* **Always** call `await next()` unless intentionally short-circuiting.
* Don’t mutate unrelated parts of `ctx`. If you need state: **namespace** under `ctx.state.yourFeature`.
* Log via `ctx.log` (respect `LOG_LEVEL`); never `console.*` directly.
* Propagate cancellation: read and pass `ctx.signal` to I/O.

### 5) Tools (Function Calling)

* Define tools with **zod** schemas; validate inputs before running.
* Name tools clearly (`verbNoun`, e.g., `getWeather`), keep them **idempotent** and side-effect free.
* Return small, serializable results; avoid embedding huge blobs.

```ts
import { z } from 'zod';

export const getWeather = {
  name: 'getWeather',
  description: 'Get weather for a city',
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({ city, tempC: 21, summary: 'Sunny' }),
};
```

### 6) Adapters (LLM)

* Implement `generate(messages, opts)`; support non-streaming and (if applicable) streaming via `AsyncIterable`.
* Respect `opts.tools`, `opts.toolChoice` (`'auto' | 'none'`), and surface `usage` if the provider returns it.
* Never leak provider secrets in logs; rely on the redacting logger.

### 7) Errors & Guardrails

* Throw real `Error` objects with helpful messages; include `cause` when wrapping.
* No catch-and-silence: either handle or rethrow to the **error boundary** middleware.
* Validate protocol with invariants middleware (tool\_calls ↔ tool replies) in development.

### 8) Tests

* **Vitest** with target **≥ 80%** coverage.
* Unit tests for:

  * happy path,
  * invalid schema inputs,
  * cancellation via `AbortSignal`,
  * edge cases (empty messages, provider quirks).
* Mock external I/O; keep tests deterministic.

### 9) Tracing & Observability

* Use the tracing logger; prefer **structured logs** over ad-hoc strings.
* For examples and demos, write trace files (`run.json`/`run.html`) to aid debugging.

### 10) Performance & Safety

* Avoid unbounded arrays in `ctx.messages`; use `conversationBuffer` where appropriate.
* Don’t block the event loop; prefer async I/O and streaming.
* Cap external fetch sizes; time out I/O using `AbortSignal`.

### 11) Repo Hygiene

* One changeset per logical change:

  * `npm run changeset` → commit → PR
  * Version & publish handled by release workflow.
* PR checklist:

  * [ ] API surface is minimal and documented
  * [ ] Types precise; zero `any`
  * [ ] Tests added/updated; coverage OK
  * [ ] Changelog (changeset) present
  * [ ] No secrets or noisy logs