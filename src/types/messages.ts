// message.ts — Chat Completions friendly

export type Role = 'system' | 'user' | 'assistant' | 'tool';

/** Content parts you can send in `messages[].content` */
export type ContentPart =
  | { type: 'text'; text: string }                     // plain text
  | { type: 'image_url'; image_url: {                  // vision input
        url: string;                                   // http(s) or data: URI
        detail?: 'low' | 'high';                       // optional quality hint
      } };

/** Base shape (some roles also add fields below) */
interface BaseMessage {
  role: Role;
  /** For requests: string or multimodal parts. (OpenAI accepts either.) */
  content?: string | ContentPart[];
  /** Optional label you can use in your app */
  name?: string;
  /** Optional metadata passthrough */
  metadata?: Record<string, unknown>;
}

/** User/System messages (what you send) */
export interface UserMessage extends BaseMessage {
  role: 'user';
  content: string | ContentPart[];
}
export interface SystemMessage extends BaseMessage {
  role: 'system';
  content: string | ContentPart[];
}

/** Assistant tool call (what the model may return) */
export interface AssistantToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON string per OpenAI spec */
    arguments: string;
  };
}

/** Assistant message (may ask you to call a tool) */
export interface AssistantMessage extends BaseMessage {
  role: 'assistant';
  content?: string | ContentPart[];     // model’s natural text
  tool_calls?: AssistantToolCall[];     // when function calling is used
}

/** Your tool’s response back to the model */
export interface ToolMessage {
  role: 'tool';
  /** Must match the assistant’s tool_call id */
  tool_call_id: string;
  /** Tool output as a string (JSON stringify if structured) */
  content: string;
  metadata?: Record<string, unknown>;
}

/** Union you can pass to OpenAI Chat Completions */
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;
