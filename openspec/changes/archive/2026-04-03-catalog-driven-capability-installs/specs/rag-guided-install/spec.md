## ADDED Requirements

### Requirement: RAG Recommended Flow Installs A Working Default Stack
The system SHALL provide a recommended RAG install flow that installs and configures a working default stack using `@sisu-ai/vector-vectra`.

#### Scenario: User selects RAG recommended flow
- **WHEN** a user chooses the recommended RAG install option
- **THEN** the installer MUST install the required RAG tool, RAG middleware, and default vector backend package and apply required setup actions

### Requirement: RAG Advanced Flow Supports Backend Selection
The system SHALL provide an advanced RAG install flow that allows users to select vector backend options including vectra, chroma, or custom package input.

#### Scenario: User selects chroma backend in advanced flow
- **WHEN** a user chooses advanced RAG install and selects `chroma`
- **THEN** the installer MUST install the RAG stack with chroma backend wiring and persist matching vector store configuration

### Requirement: Guided RAG Flow Preserves User Control
Guided RAG install MUST allow cancellation before execution and MUST provide explicit next-step guidance when canceled.

#### Scenario: User cancels advanced flow before install
- **WHEN** the user exits the RAG advanced selector before confirming install
- **THEN** no package installation or config mutation MUST occur and the CLI MUST return to setup with cancellation feedback
