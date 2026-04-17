## Why

Sisu CLI chat currently hard-codes most runtime capabilities, so users cannot easily tailor tools, skills, or middleware to their workflow. We should add first-class, user-controlled capability configuration now to make CLI chat safer, more adaptable, and consistent with Sisu's composable architecture.

## What Changes

- Add a capability configuration model for CLI chat that lets users enable/disable tools, skills, and middleware with layered precedence (global, project, session).
- Add interactive capability management commands and menu flows in chat so users can inspect and change enabled capabilities without editing JSON manually.
- Add skill discovery and loading from standard directories (global `~/.sisu/skills` and project `./.sisu/skills`) with explicit allow/disable controls.
- Add a skill installation workflow that supports both scripted installation (`skills.sh` wrapper around CLI command) and manual folder drop-in discovery.
- Add middleware activation controls for a vetted middleware catalog with schema-validated configuration.
- Add official package discovery/install support from the `@sisu-ai` npm namespace for Sisu-maintained tools, skills, and middleware.
- Add official namespace package listing in CLI so users can discover `@sisu-ai` middleware/tools/skills by category before install/enable.
- Extend profile schema and validation to include capability settings, with explicit conflict/error reporting.
- Preserve existing behavior by default for users who do not opt into new capability settings.

### Goals

- Make CLI chat capability activation explicit, safe, and discoverable.
- Support both interactive and file-based configuration workflows.
- Provide consistent global + project configuration layering for tools, skills, and middleware.
- Keep activation behavior deterministic and auditable across restarts.

### Non-goals

- Executing arbitrary third-party code as middleware at runtime.
- Replacing existing tool policy safety checks or removing confirmation gates.
- Building a remote marketplace or hosted distribution service for skills in this change.

## Capabilities

### New Capabilities

- `cli-capability-configuration`: Layered profile configuration for enabling/disabling tools, skills, and middleware in CLI chat.
- `cli-interactive-capability-management`: Chat commands/menus to list, enable, disable, and inspect configured tools, skills, and middleware.
- `cli-skill-discovery-installation`: Skill discovery from `~/.sisu/skills` and `./.sisu/skills`, plus install command/script workflow.
- `cli-middleware-activation-controls`: Middleware catalog activation with validated per-middleware options and deterministic startup behavior.

### Modified Capabilities

- None.

## Impact

- **Target audience**: CLI-first developers and teams using Sisu for local automation workflows.
- **Intended use cases**: hardening tool access, project-specific skill packs, per-project middleware tuning, repeatable team onboarding.
- **User-facing changes**: new chat commands/menu entries for capability management; new optional profile fields under `.sisu/chat-profile.json` and `~/.sisu/chat-profile.json`; skill install workflow.
- **User-facing changes**: official discovery/install source in `@sisu-ai` namespace for Sisu-supported capability packages.
- **User-facing changes**: official package listing commands for `@sisu-ai` middleware/tools/skills with strict namespace filtering.
- **API surface changes**: expanded internal CLI chat profile types and runtime contracts for capability registry, discovery, and activation.
- **Affected systems**: `packages/cli/sisu/src/chat/*` (profiles, runtime, command handlers), skill discovery/loading integration, docs for chat configuration.
- **Dependencies**: existing `@sisu-ai/mw-skills` discovery/loader behavior and current CLI profile/session persistence modules.
- **Breaking changes**: none expected; default runtime behavior remains compatible when new configuration is absent.

## Success Metrics

- Users can enable/disable tools, skills, and middleware interactively in chat without manual file editing.
- CLI loads configured capabilities deterministically with clear startup validation errors for invalid configuration.
- Skill discovery works from both global and project skill directories with explicit precedence and conflict handling.
- Existing users who do not configure capability settings observe no regressions in chat startup or execution.

## Acceptance Criteria

- Proposal-aligned design, specs, and tasks define complete behavior for capability configuration, interactive management, and skill discovery/install workflows.
- New capability settings are optional and backward-compatible with current profiles.
- Requirements include explicit safety and error-reporting behavior for invalid capability activation or conflicts.
