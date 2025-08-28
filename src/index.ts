import { Message } from './types/messages';
import { request as defaultRequest } from './request';
import type { ChatTransport } from './core/transport';

export interface Config {
  model: string;          // e.g., "gpt-4o-mini"
  system?: string;        // optional default system prompt
}

export interface SisuClient<R = unknown> {
  // High-level API: accept string or Message[]; applies system injection logic
  request(
    msg: string | Message | Message[],
    opts?: { model?: string; system?: string; injectSystem?: boolean }
  ): Promise<R>;
  // Clearer alias when you already have messages[]
  chat(messages: Message[], model?: string): Promise<R>;
  // Sugar for single prompt string (no system injection)
  complete(prompt: string, model?: string): Promise<R>;
}

type ChatFn<R> = (messages: Message[], model: string) => Promise<R>;

export function sisu<R = unknown>(
  config: Config,
  reqOrTransport: ChatFn<R> | ChatTransport<R> = defaultRequest as ChatFn<R>
): SisuClient<R> {
  const baseModel = config.model;
  const baseSystem = config.system;

  const req: ChatFn<R> =
    typeof reqOrTransport === 'function'
      ? reqOrTransport
      : (messages, model) => reqOrTransport.chat(messages, model);

  function normalize(input: string | Message | Message[]): Message[] {
    if (Array.isArray(input)) return input;
    if (typeof input === 'string') return [{ role: 'user', content: input }];
    return [input];
  }

  return {
    async request(input, opts = {}) {
      const model = opts.model ?? baseModel;
      const system = opts.system ?? baseSystem;
      const injectSystem = opts.injectSystem ?? Boolean(system);

      let messages = normalize(input);

      if (injectSystem && system && messages[0]?.role !== 'system') {
        messages = [{ role: 'system', content: system }, ...messages];
      }

      return req(messages, model);
    },
    async chat(messages, model) {
      return req(messages, model ?? baseModel);
    },
    async complete(prompt, model) {
      return req([{ role: 'user', content: prompt }], model ?? baseModel);
    },
  };
}

export type { Message } from './types/messages';
export * as Msg from './utils/messages';
export type { ChatCompletion } from './types/chat';
