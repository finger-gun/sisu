import 'dotenv/config';
import { openAIAdapter } from '@sisu-ai/adapter-openai';

const model = openAIAdapter({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini' });

async function main() {
  const iter = await model.generate(
    [{ role: 'user', content: process.argv.filter(a => !a.startsWith('--')).slice(2).join(' ') || 'Please explain our solar system as if I was 5.' }],
    { stream: true }
  );
  for await (const ev of iter as any) {
    if (ev.type === 'token') process.stdout.write(ev.token);
  }
  process.stdout.write('\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
