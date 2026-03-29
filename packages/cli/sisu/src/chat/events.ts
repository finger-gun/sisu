export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';

export type ChatRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ToolExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'denied' | 'cancelled';

export interface ChatMessage {
  id: string;
  sessionId: string;
  runId?: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChatRun {
  id: string;
  sessionId: string;
  requestMessageId: string;
  status: ChatRunStatus;
  stepSummaries: string[];
  startedAt: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ToolExecutionRecord {
  id: string;
  sessionId: string;
  runId: string;
  toolName: string;
  requestPreview: string;
  status: ToolExecutionStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  denialReason?: string;
  outputPreview?: string;
}

export interface ChatRunSummary {
  runId: string;
  requestMessageId: string;
  status: ChatRunStatus;
  completedSteps: number;
  failedStep?: string;
}

export interface ChatCommandResult {
  summary: ChatRunSummary;
  assistantMessage?: ChatMessage;
}

export type ChatEvent =
  | {
      type: 'user.submitted';
      sessionId: string;
      runId: string;
      message: ChatMessage;
    }
  | {
      type: 'assistant.message.started';
      sessionId: string;
      runId: string;
      message: ChatMessage;
    }
  | {
      type: 'assistant.token.delta';
      sessionId: string;
      runId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: 'assistant.message.completed';
      sessionId: string;
      runId: string;
      message: ChatMessage;
    }
  | {
      type: 'assistant.message.failed';
      sessionId: string;
      runId: string;
      message: ChatMessage;
      errorCode: string;
      errorMessage: string;
    }
  | {
      type: 'assistant.message.cancelled';
      sessionId: string;
      runId: string;
      message: ChatMessage;
    }
  | {
      type: 'run.step.started';
      sessionId: string;
      runId: string;
      step: string;
    }
  | {
      type: 'run.step.completed';
      sessionId: string;
      runId: string;
      step: string;
    }
  | {
      type: 'run.completed';
      sessionId: string;
      runId: string;
      summary: ChatRunSummary;
    }
  | {
      type: 'run.failed';
      sessionId: string;
      runId: string;
      summary: ChatRunSummary;
      errorCode: string;
      errorMessage: string;
    }
  | {
      type: 'run.cancelled';
      sessionId: string;
      runId: string;
      summary: ChatRunSummary;
    }
  | {
      type: 'tool.pending';
      sessionId: string;
      runId: string;
      record: ToolExecutionRecord;
    }
  | {
      type: 'tool.running';
      sessionId: string;
      runId: string;
      record: ToolExecutionRecord;
    }
  | {
      type: 'tool.completed';
      sessionId: string;
      runId: string;
      record: ToolExecutionRecord;
    }
  | {
      type: 'tool.failed';
      sessionId: string;
      runId: string;
      record: ToolExecutionRecord;
      errorCode: string;
      errorMessage: string;
    }
  | {
      type: 'tool.denied';
      sessionId: string;
      runId: string;
      record: ToolExecutionRecord;
      reason: string;
    }
  | {
      type: 'tool.cancelled';
      sessionId: string;
      runId: string;
      record: ToolExecutionRecord;
    }
  | {
      type: 'session.saved';
      sessionId: string;
      runId: string;
    }
  | {
      type: 'error.raised';
      sessionId: string;
      runId?: string;
      code: string;
      message: string;
    };
