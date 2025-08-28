import type { Message } from '../types/messages';

export interface ChatTransport<R> {
  chat(messages: Message[], model: string): Promise<R>;
}

