import type { Tool, ToolContext } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';
import { z } from 'zod';

// --- GitHub GraphQL client helpers ---

function resolveGraphQLEndpoint(): string {
  const explicit = firstConfigValue(['GITHUB_GRAPHQL_URL']);
  if (explicit) return explicit.replace(/\/$/, '');
  const host = firstConfigValue(['GITHUB_ENTERPRISE_HOSTNAME']) || 'https://api.github.com';
  return host.replace(/\/$/, '') + '/graphql';
}

function resolveToken(): string | undefined {
  return firstConfigValue(['GITHUB_ACCESS_TOKEN','GITHUB_TOKEN']);
}

async function ghGraphQL(query: string, variables: Record<string, unknown> | undefined, ctx: ToolContext): Promise<any> {
  const endpoint = resolveGraphQLEndpoint();
  const token = resolveToken();
  if (!token) throw new Error('Missing GitHub token. Set GITHUB_ACCESS_TOKEN or GITHUB_TOKEN.');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: ctx.signal,
  } as any);
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status}: ${text?.slice(0, 500)}`);
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { throw new Error('GitHub GraphQL returned invalid JSON'); }
  if (json.errors) throw new Error(`GitHub GraphQL error: ${JSON.stringify(json.errors)}`);
  return json;
}

function requireProjectId(): string {
  const pid = firstConfigValue(['GITHUB_PROJECT_ID']);
  if (!pid) throw new Error('GITHUB_PROJECT_ID is not set.');
  return pid;
}

// --- Domains ---

export interface IssueSummary { id: string; itemId: string; title: string; state?: string; url?: string }
export interface IssueDetails { title?: string; body?: string; state?: string; url?: string; author?: string; createdAt?: string; updatedAt?: string }
export interface StatusOption { id: string; name: string; fieldId: string }

async function listProjectIssues(ctx: ToolContext): Promise<IssueSummary[]> {
  const projectId = requireProjectId();
  const query = `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              content { ... on Issue { id title state url } }
            }
          }
        }
      }
    }
  `;
  const json = await ghGraphQL(query, { projectId }, ctx);
  const nodes = json?.data?.node?.items?.nodes ?? [];
  const out: IssueSummary[] = [];
  for (const it of nodes) {
    const c = it?.content;
    if (c?.id && c?.title) out.push({ id: c.id, itemId: it.id, title: c.title, state: c.state, url: c.url });
  }
  return out;
}

async function getIssueDetails(issueId: string, ctx: ToolContext): Promise<IssueDetails | undefined> {
  const query = `
    query($id: ID!) {
      node(id: $id) {
        ... on Issue {
          title
          body
          state
          url
          createdAt
          updatedAt
          author { login }
        }
      }
    }
  `;
  const json = await ghGraphQL(query, { id: issueId }, ctx);
  const n = json?.data?.node;
  if (!n) return undefined;
  return { title: n.title, body: n.body, state: n.state, url: n.url, createdAt: n.createdAt, updatedAt: n.updatedAt, author: n.author?.login };
}

async function getStatusFieldId(ctx: ToolContext): Promise<string> {
  const projectId = requireProjectId();
  const query = `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes { ... on ProjectV2SingleSelectField { id name } }
          }
        }
      }
    }
  `;
  const json = await ghGraphQL(query, { projectId }, ctx);
  const fields: Array<{id: string, name?: string}> = json?.data?.node?.fields?.nodes ?? [];
  const status = fields.find(f => f?.name === 'Status') || fields[0];
  if (!status?.id) throw new Error('Could not find Status field in project');
  return status.id;
}

async function getProjectItemId(issueId: string, ctx: ToolContext): Promise<string> {
  const list = await listProjectIssues(ctx);
  const found = list.find(i => i.id === issueId);
  if (!found?.itemId) throw new Error(`Issue ${issueId} not found in project`);
  return found.itemId;
}

async function listStatusOptions(ctx: ToolContext): Promise<StatusOption[]> {
  const projectId = requireProjectId();
  const query = `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 100) {
            nodes {
              __typename
              ... on ProjectV2SingleSelectField { id name options { id name } }
            }
          }
        }
      }
    }
  `;
  const json = await ghGraphQL(query, { projectId }, ctx);
  const fields = json?.data?.node?.fields?.nodes ?? [];
  const statusField = fields.find((f: any) => f?.__typename === 'ProjectV2SingleSelectField' && f?.name === 'Status');
  if (!statusField) return [];
  const fieldId = statusField.id;
  const options: Array<{id:string,name:string}> = statusField.options ?? [];
  return options.map(o => ({ id: o.id, name: o.name, fieldId }));
}

async function moveIssueToColumn(issueId: string, optionId: string, ctx: ToolContext): Promise<{ itemId: string }> {
  const projectId = requireProjectId();
  const fieldId = await getStatusFieldId(ctx);
  const itemId = await getProjectItemId(issueId, ctx);
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $singleSelectOptionId: String!) {
      updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $singleSelectOptionId } }) {
        projectV2Item { id }
      }
    }
  `;
  const json = await ghGraphQL(mutation, { projectId, itemId, fieldId, singleSelectOptionId: optionId }, ctx);
  const updated = json?.data?.updateProjectV2ItemFieldValue?.projectV2Item?.id;
  if (!updated) throw new Error('Failed to move issue');
  return { itemId };
}

async function updateIssue(issueId: string, title: string | undefined, body: string | undefined, ctx: ToolContext): Promise<{ id: string, title?: string, body?: string }> {
  const mutation = `
    mutation($input: UpdateIssueInput!) {
      updateIssue(input: $input) { issue { id title body } }
    }
  `;
  const input: any = { id: issueId };
  if (typeof title === 'string') input.title = title;
  if (typeof body === 'string') input.body = body;
  const json = await ghGraphQL(mutation, { input }, ctx);
  const issue = json?.data?.updateIssue?.issue;
  if (!issue?.id) throw new Error('Failed to update issue');
  return issue;
}

// --- Tools ---

export const listGitHubIssues: Tool<{}> = {
  name: 'listGitHubIssues',
  description: 'List all issues in the configured GitHub Project (Projects v2). Returns id, title, state, url.',
  schema: z.object({}).strict(),
  handler: async (_args, ctx) => {
    try {
      const issues = await listProjectIssues(ctx);
      return issues;
    } catch (e: any) {
      return `Failed to list issues: ${e?.message || String(e)}`;
    }
  },
};

export const getGitHubIssueDetails: Tool<{ issueId: string }> = {
  name: 'getGitHubIssueDetails',
  description: 'Get details for an issue by node ID (e.g., I_123).',
  schema: z.object({ issueId: z.string().min(3) }),
  handler: async ({ issueId }, ctx) => {
    if (!issueId.startsWith('I_')) return 'Invalid or missing issue ID. Provide a value like I_123.';
    try {
      const d = await getIssueDetails(issueId, ctx);
      if (!d) return `No details found for issue ${issueId}.`;
      return d;
    } catch (e: any) {
      return `Failed to fetch issue details: ${e?.message || String(e)}`;
    }
  },
};

export const listGitHubProjectColumns: Tool<{}> = {
  name: 'listGitHubProjectColumns',
  description: 'List Status column options for the project with their IDs (usable in moveGitHubIssueToColumn).',
  schema: z.object({}).strict(),
  handler: async (_args, ctx) => {
    try {
      const cols = await listStatusOptions(ctx);
      return cols;
    } catch (e: any) {
      return `Failed to fetch columns: ${e?.message || String(e)}`;
    }
  },
};

export const moveGitHubIssueToColumn: Tool<{ issueId: string, columnId: string }> = {
  name: 'moveGitHubIssueToColumn',
  description: 'Move an issue to a specific Status option (column) in the configured project.',
  schema: z.object({ issueId: z.string().min(3), columnId: z.string().min(3) }),
  handler: async ({ issueId, columnId }, ctx) => {
    if (!issueId.startsWith('I_')) return 'Invalid or missing issue ID. Provide a value like I_123.';
    try {
      const res = await moveIssueToColumn(issueId, columnId, ctx);
      return { ok: true, movedItemId: res.itemId };
    } catch (e: any) {
      return `Failed to move issue: ${e?.message || String(e)}`;
    }
  },
};

export const updateGitHubIssue: Tool<{ issueId: string, title?: string, body?: string }> = {
  name: 'updateGitHubIssue',
  description: 'Update an issue title and/or body by node ID (e.g., I_123).',
  schema: z.object({
    issueId: z.string().min(3),
    title: z.string().optional(),
    body: z.string().optional(),
  }),
  handler: async ({ issueId, title, body }, ctx) => {
    if (!issueId.startsWith('I_')) return 'Invalid or missing issue ID. Provide a value like I_123.';
    if (title === undefined && body === undefined) return 'Specify at least one of title or body to update.';
    try {
      const res = await updateIssue(issueId, title, body, ctx);
      return { ok: true, id: res.id, title: res.title, body: res.body };
    } catch (e: any) {
      return `Failed to update issue: ${e?.message || String(e)}`;
    }
  },
};

export default [
  listGitHubIssues,
  getGitHubIssueDetails,
  listGitHubProjectColumns,
  moveGitHubIssueToColumn,
  updateGitHubIssue,
];

