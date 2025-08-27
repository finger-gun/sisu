import 'dotenv/config'
import { Message } from './types/messages';
import { request as defaultRequest } from './request';

export interface Config {
  model: string;          // e.g., "gpt-4o-mini"
  system?: string;        // optional default system prompt
}

export interface SisuClient<R = string> {
  request(
    msg: string | Message | Message[],
    opts?: { model?: string; system?: string; injectSystem?: boolean }
  ): Promise<R>;
}

type RequestFn<R> = (messages: Message[], model: string) => Promise<R>;

export function sisu<R = string>(
  config: Config,
  req: RequestFn<R> = defaultRequest as RequestFn<R>
): SisuClient<R> {
  const baseModel = config.model;
  const baseSystem = config.system;

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
  };
}