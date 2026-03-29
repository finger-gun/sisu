import type { ChatEvent, ChatMessage, ChatRun, ToolExecutionRecord } from './events.js';

export interface ChatState {
  sessionId: string;
  messages: ChatMessage[];
  runs: ChatRun[];
  toolExecutions: ToolExecutionRecord[];
  events: ChatEvent[];
  activeRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export function createChatState(sessionId: string, nowIso: string): ChatState {
  return {
    sessionId,
    messages: [],
    runs: [],
    toolExecutions: [],
    events: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function upsertMessage(messages: ChatMessage[], message: ChatMessage): void {
  const index = messages.findIndex((entry) => entry.id === message.id);
  if (index === -1) {
    messages.push(message);
    return;
  }
  messages[index] = message;
}

function upsertRun(runs: ChatRun[], run: ChatRun): void {
  const index = runs.findIndex((entry) => entry.id === run.id);
  if (index === -1) {
    runs.push(run);
    return;
  }
  runs[index] = run;
}

function upsertTool(records: ToolExecutionRecord[], record: ToolExecutionRecord): void {
  const index = records.findIndex((entry) => entry.id === record.id);
  if (index === -1) {
    records.push(record);
    return;
  }
  records[index] = record;
}

export function applyChatEvent(state: ChatState, event: ChatEvent, nowIso: string): ChatState {
  state.events.push(event);
  state.updatedAt = nowIso;

  switch (event.type) {
    case 'user.submitted':
      upsertMessage(state.messages, event.message);
      state.activeRunId = event.runId;
      return state;
    case 'assistant.message.started':
    case 'assistant.message.completed':
    case 'assistant.message.failed':
    case 'assistant.message.cancelled':
      upsertMessage(state.messages, event.message);
      return state;
    case 'tool.pending':
    case 'tool.running':
    case 'tool.completed':
    case 'tool.failed':
    case 'tool.denied':
    case 'tool.cancelled':
      upsertTool(state.toolExecutions, event.record);
      return state;
    case 'run.completed':
    case 'run.failed':
    case 'run.cancelled':
      state.activeRunId = undefined;
      return state;
    case 'assistant.token.delta': {
      const target = state.messages.find((message) => message.id === event.messageId);
      if (target) {
        target.content += event.delta;
        target.updatedAt = nowIso;
      }
      return state;
    }
    case 'run.step.started':
    case 'run.step.completed':
    case 'session.saved':
    case 'error.raised':
      return state;
    default:
      return state;
  }
}

export function upsertChatRun(state: ChatState, run: ChatRun, nowIso: string): void {
  upsertRun(state.runs, run);
  state.updatedAt = nowIso;
}
