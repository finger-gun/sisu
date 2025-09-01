import { test, expect, vi, afterEach, beforeEach } from 'vitest';
import tools, { listGitHubIssues, getGitHubIssueDetails, listGitHubProjectColumns, moveGitHubIssueToColumn, updateGitHubIssue } from '../src/index.js';

// Minimal ctx mock
const ctx: any = { signal: undefined };

beforeEach(() => {
  (process.env as any).GITHUB_ACCESS_TOKEN = 't';
  (process.env as any).GITHUB_PROJECT_ID = 'PVT_abc';
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).GITHUB_ACCESS_TOKEN;
  delete (process.env as any).GITHUB_TOKEN;
  delete (process.env as any).GITHUB_PROJECT_ID;
  delete (process.env as any).GITHUB_GRAPHQL_URL;
  delete (process.env as any).GITHUB_ENTERPRISE_HOSTNAME;
});

test('exports all tools as default array', () => {
  expect(Array.isArray(tools)).toBe(true);
  expect(tools.find(t => t.name === 'listGitHubIssues')).toBeTruthy();
});

test('listGitHubIssues returns mapped issues', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      data: { node: { items: { nodes: [
        { id: 'PITEM_1', content: { id: 'I_1', title: 'Issue one', state: 'OPEN', url: 'u1' } },
        { id: 'PITEM_2', content: { id: 'I_2', title: 'Issue two', state: 'CLOSED', url: 'u2' } }
      ] } } }
    })
  } as any);
  const res: any = await listGitHubIssues.handler({}, ctx);
  expect(res.length).toBe(2);
  expect(res[0]).toMatchObject({ id: 'I_1', itemId: 'PITEM_1', title: 'Issue one' });
});

test('getGitHubIssueDetails validates id format', async () => {
  const res = await getGitHubIssueDetails.handler({ issueId: '123' } as any, ctx);
  expect(String(res)).toMatch(/Invalid/);
});

test('listGitHubProjectColumns returns Status options', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({
    data: { node: { fields: { nodes: [
      { __typename: 'ProjectV2SingleSelectField', id: 'F_status', name: 'Status', options: [ { id: 'opt_todo', name: 'To do' }, { id: 'opt_ip', name: 'In progress' } ] }
    ] } } }
  }) } as any);
  const res: any = await listGitHubProjectColumns.handler({}, ctx);
  expect(res.map((r: any) => r.id)).toEqual(['opt_todo','opt_ip']);
});

test('moveGitHubIssueToColumn wires calls together', async () => {
  // 1) getStatusFieldId
  // 2) listProjectIssues
  // 3) mutation
  const responses = [
    { // getStatusFieldId
      data: { node: { fields: { nodes: [ { id: 'F_status', name: 'Status' } ] } } }
    },
    { // listProjectIssues
      data: { node: { items: { nodes: [ { id: 'PITEM_x', content: { id: 'I_9', title: 't' } } ] } } }
    },
    { // mutation
      data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PITEM_x' } } }
    }
  ];
  let i = 0;
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(responses[i++]) } as any);
  const res: any = await moveGitHubIssueToColumn.handler({ issueId: 'I_9', columnId: 'opt_ip' } as any, ctx);
  expect(res.ok).toBe(true);
  expect(res.movedItemId).toBe('PITEM_x');
});

test('updateGitHubIssue validates inputs and updates', async () => {
  // invalid
  const bad = await updateGitHubIssue.handler({ issueId: 'bad' } as any, ctx);
  expect(String(bad)).toMatch(/Invalid/);

  // valid path
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({
    data: { updateIssue: { issue: { id: 'I_5', title: 'T', body: 'B' } } }
  }) } as any);
  const ok: any = await updateGitHubIssue.handler({ issueId: 'I_5', title: 'T' } as any, ctx);
  expect(ok.ok).toBe(true);
  expect(ok.id).toBe('I_5');
});

