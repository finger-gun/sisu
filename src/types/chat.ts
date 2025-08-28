export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: unknown;
  [key: string]: unknown;
}

export interface ChatChoice {
  index?: number;
  message?: ChatMessage;
  finish_reason?: string | null;
  [key: string]: unknown;
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface ChatCompletion {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: ChatChoice[];
  usage?: ChatUsage;
  [key: string]: unknown;
}

