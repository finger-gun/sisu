import 'dotenv/config'
import { Message } from './types/messages';

export async function request(messages: Message[] = [], model = "openai/gpt-4o-mini"): Promise<object> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.API_KEY}`,
      "HTTP-Referer": "https://github.com/finger-gun/sisu",
      "X-Title": "sisu",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": model,
      "messages": messages
    })
  });
  return await response.json();
}