import {
  AssistantMessage,
  AssistantToolCall,
  ContentPart,
  SystemMessage,
  ToolMessage,
  UserMessage,
} from '../types/messages';

export function asUser(text: string | ContentPart[]): UserMessage {
  return {
    role: 'user',
    content: Array.isArray(text) ? text : String(text),
  };
}

export function asSystem(text: string | ContentPart[]): SystemMessage {
  return {
    role: 'system',
    content: Array.isArray(text) ? text : String(text),
  };
}

export function asTool(tool_call_id: string, content: string, metadata?: Record<string, unknown>): ToolMessage {
  return {
    role: 'tool',
    tool_call_id,
    content,
    ...(metadata ? { metadata } : {}),
  };
}

export function asAssistant(
  content?: string | ContentPart[],
  tool_calls?: AssistantToolCall[]
): AssistantMessage {
  return {
    role: 'assistant',
    ...(content !== undefined ? { content } : {}),
    ...(tool_calls ? { tool_calls } : {}),
  };
}

