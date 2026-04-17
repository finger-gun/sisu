## Purpose

Define requirements for the dual-agent RAG example using Chroma storage.

## Requirements
### Requirement: Separate Ingestion and Query Agents
The `examples/openai-rag-chroma` example SHALL define separate agent flows for ingestion and user query handling.

#### Scenario: Developer runs ingestion flow
- **WHEN** the ingestion flow is invoked
- **THEN** the ingestion agent MUST ingest/index content into Chroma without requiring a user question prompt

#### Scenario: Developer runs query flow
- **WHEN** a user submits a retrieval question
- **THEN** the query agent MUST process the prompt and use retrieval tooling to fetch relevant context

### Requirement: Query Agent Uses Retrieval Tooling
The query agent MUST register and expose retrieval tooling that allows the model to perform semantic search based on user prompts.

#### Scenario: Model chooses retrieval tool during answer generation
- **WHEN** the model determines additional context is needed to answer a user question
- **THEN** the query agent MUST allow tool-calling to invoke retrieval and incorporate results into the final response

### Requirement: Example Uses OpenAI Embeddings
The example SHALL use OpenAI embeddings in place of toy embeddings for retrieval-related indexing and querying paths.

#### Scenario: Example is configured with OpenAI credentials
- **WHEN** required OpenAI environment variables are set
- **THEN** ingestion and retrieval embedding operations MUST use OpenAI embedding configuration

### Requirement: Example Guidance Covers Two-Agent Workflow
The example documentation MUST explain how to run ingestion and retrieval workflows and what each agent is responsible for.

#### Scenario: Developer follows example documentation
- **WHEN** a developer reads the updated example instructions
- **THEN** they MUST be able to run ingestion first and then run prompt-driven retrieval with the query agent

