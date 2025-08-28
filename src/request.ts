import { Message } from './types/messages';
import { getApiKey, getBaseUrl, getTimeoutMs, getChatPath } from './env';
import type { ChatCompletion } from './types/chat';
import { createHttpRequester } from './core/requester';

const requester = createHttpRequester({
  baseUrl: getBaseUrl(),
  timeoutMs: getTimeoutMs(),
  defaultHeaders: () => ({
    Authorization: `Bearer ${getApiKey()}`,
    'HTTP-Referer': 'https://github.com/finger-gun/sisu',
    'X-Title': 'sisu',
  }),
});

export async function httpChat(
  messages: Message[] = [],
  model = 'openai/gpt-4o-mini'
): Promise<ChatCompletion> {
  return requester(getChatPath(), {
    method: 'POST',
    body: { model, messages },
  });
}

// Back-compat: keep the original name that other modules/tests import
export const request = httpChat;
export { requester };
