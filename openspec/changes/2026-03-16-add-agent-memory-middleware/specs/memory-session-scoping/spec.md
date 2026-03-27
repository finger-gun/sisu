## ADDED Requirements

### Requirement: Memory session scoping is explicit and deterministic
The system SHALL define a deterministic precedence and keying strategy for resolving memory scope identity.

#### Scenario: Session id resolution precedence
- **WHEN** both middleware resolver callback and `ctx.state` session values are present
- **THEN** the explicit middleware resolver value MUST take precedence

#### Scenario: Missing session for session scope
- **WHEN** `scope=session` and no session id is resolvable
- **THEN** the middleware MUST apply configured behavior (error, skip, or fallback) deterministically

### Requirement: Scope boundaries are enforced
The system SHALL prevent memory leakage across scope boundaries.

#### Scenario: Session and global scopes in same run environment
- **WHEN** runs share agent runtime but use different scopes
- **THEN** memory retrieval and persistence MUST remain isolated to the active scope identity

### Requirement: Memory retrieval is selectively scoped for relevance
The system SHALL retrieve memory according to active scope and bounded relevance controls.

#### Scenario: New session with same user scope
- **WHEN** a run starts in a new `session` scope but with the same user identity
- **THEN** session-scoped memory MUST remain isolated while user/global memory MAY be retrieved by explicit policy

#### Scenario: Context growth requires bounded retrieval
- **WHEN** scoped memory exceeds configured load limits
- **THEN** middleware MUST return only bounded entries according to deterministic ordering rules
