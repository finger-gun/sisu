# @sisu-ai/tool-github-projects

Utilities for integrating with GitHub Projects (Projects v2) via GraphQL. Exposes tools to list issues, fetch issue details, list status columns, move issues between columns, and update issue title/body.

## Tools

- `listGitHubIssues`: List issues in the configured project (via `GITHUB_PROJECT_ID`).
- `getGitHubIssueDetails`: Fetch details for a specific issue by its node ID (e.g., `I_123`).
- `listGitHubProjectColumns`: List the Status field options (columns) and their IDs.
- `moveGitHubIssueToColumn`: Move an issue to a specific Status option (column).
- `updateGitHubIssue`: Update an issue title and/or body.

## Configuration

Environment variables (CLI flags of the same name but kebab-cased also work, e.g., `--github-access-token`):

- `GITHUB_ACCESS_TOKEN` or `GITHUB_TOKEN`: Personal access token.
- `GITHUB_PROJECT_ID`: ProjectV2 node ID (e.g., `PVT_xxx`).
- `GITHUB_GRAPHQL_URL` (optional): Full GraphQL endpoint. Defaults to `https://api.github.com/graphql`.
- `GITHUB_ENTERPRISE_HOSTNAME` (optional): Base host for Enterprise (e.g., `https://github.mycorp.com`). Used if `GITHUB_GRAPHQL_URL` not set.

## Notes

- Column IDs refer to Status field option IDs, suitable for `moveGitHubIssueToColumn`.
- Issue IDs are GitHub node IDs (e.g., `I_123`) returned by `listGitHubIssues`.

