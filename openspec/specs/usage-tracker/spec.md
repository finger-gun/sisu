## Purpose

Define usage tracking requirements for token, cost, and usage aggregation.

## Requirements
### Requirement: Orchestration rolls up child usage
The system SHALL aggregate child usage metrics into orchestration-level totals in `ctx.state.orchestration`.

#### Scenario: Child usage is present
- **WHEN** one or more child runs produce usage metrics
- **THEN** orchestration totals MUST reflect aggregated prompt, completion, total tokens, and cost when available

### Requirement: Child-level usage remains inspectable
The system SHALL preserve usage visibility at per-child granularity in orchestration state.

#### Scenario: Multiple children complete with usage data
- **WHEN** each child returns usage telemetry
- **THEN** each child record MUST retain its own usage fields in addition to rolled-up totals
