<!--
SYNC IMPACT REPORT:
Version change: 1.0.0 → 1.0.0 (Initial version)
Modified principles: Initial creation of all principles
Added sections: All sections (initial constitution creation)
Removed sections: None
Templates requiring updates:
✅ plan-template.md - Constitution Check section aligns with new principles
✅ spec-template.md - User scenarios align with testing requirements  
✅ tasks-template.md - Task categorization reflects principle-driven development
Follow-up TODOs: None
-->

# Sisu Constitution

## Core Principles

### I. Transparency Over Magic
Every operation MUST be explicit, observable, and debuggable. No hidden state or implicit behavior allowed. Built-in tracing with HTML viewer generation is mandatory for all agent interactions. Structured logging with secret redaction is required for all operations.

**Rationale**: AI development suffers from "black box" problems. Sisu eliminates guesswork through complete observability, making debugging and optimization straightforward.

### II. Composability Over Monoliths
All functionality MUST be built as small, focused packages with single responsibilities. Complex behavior MUST be composed from simple, testable middleware functions following the `(ctx, next) => Promise<void>` pattern. Each package MUST have clear interfaces and minimal dependencies.

**Rationale**: Monolithic AI frameworks become unmaintainable. Composable middleware allows developers to understand, test, and modify specific behaviors without affecting the entire system.

### III. Test-First Development (NON-NEGOTIABLE)
All code MUST achieve ≥80% test coverage. Tests MUST be written before implementation. TDD cycle MUST be followed: Tests written → User approved → Tests fail → Then implement. Both unit tests (mocked) and integration tests (real APIs where applicable) are required.

**Rationale**: AI systems are complex and failure-prone. Comprehensive testing ensures reliability and prevents regressions in production deployments.

### IV. Type Safety & Provider Agnostic Design
All code MUST use strict TypeScript with zero `any` types. Prefer `unknown` with narrowing for provider-specific data. Adapter interfaces MUST allow swapping LLM providers (OpenAI ↔ Anthropic ↔ Ollama) without code changes. Breaking changes MUST follow semantic versioning.

**Rationale**: Type safety prevents runtime errors and improves developer experience. Provider-agnostic design prevents vendor lock-in and enables flexible deployments.

### V. Production-Ready Reliability
All middleware MUST handle errors gracefully through error boundaries. Secrets MUST be automatically redacted from logs. Cancellation MUST be supported via `AbortSignal`. Performance MUST support production workloads with proper memory management and context window handling.

**Rationale**: AI agents run in production environments where reliability, security, and performance are critical. These constraints ensure enterprise-grade deployments.

## Architecture Standards

### Monorepo Structure
All packages MUST be organized in the monorepo with clear separation: core, adapters, middleware (20+), tools (12+), vector, server, and examples (25+). Each package MUST have independent versioning via Changesets. Package names MUST follow the `@sisu-ai/` scope pattern.

### Middleware Pipeline
All agent behavior MUST flow through a single `Ctx` object in a Koa-style middleware pipeline. Middleware MUST call `await next()` unless intentionally short-circuiting. State MUST be namespaced under `ctx.state.yourFeature` to avoid conflicts.

### Tool System
All tools MUST use Zod schemas for input validation. Tools MUST be pure functions that return serializable results. Tool registration MUST be explicit and tools MUST be independently testable.

## Quality Gates

### Pre-Implementation Gates
- Constitution compliance verified for all new features
- User scenarios defined with independent testability
- Technical design reviewed for composability
- Type safety design approved

### Pre-Release Gates
- All tests passing with ≥80% coverage
- Integration tests completed for LLM provider features
- Documentation complete with working examples
- Changeset created with proper semantic versioning
- Security review completed (no secrets in logs)

## Development Workflow

### Package Development
- Use pnpm@9 with Turbo for monorepo management
- Follow conventional commits for change tracking
- All PRs MUST include tests and documentation updates
- Examples MUST be updated when public APIs change

### Release Management
- Use Changesets for version management and releases
- Breaking changes require MAJOR version bump
- New features require MINOR version bump
- Bug fixes and improvements require PATCH version bump

## Governance

This constitution supersedes all other development practices. Amendments require documentation, approval from maintainers, and migration plan for existing code. All PRs and code reviews MUST verify compliance with these principles.

Complexity MUST be justified against the principles - prefer simple, composable solutions over clever implementations. Use [AGENTS.md](../../AGENTS.md) for runtime development guidance and specific implementation patterns.

**Version**: 1.0.0 | **Ratified**: 2026-02-02 | **Last Amended**: 2026-02-02
