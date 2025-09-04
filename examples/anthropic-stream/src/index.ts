import 'dotenv/config';
import { anthropicAdapter } from '@sisu-ai/adapter-anthropic';

const model = anthropicAdapter({ model: process.env.MODEL || 'claude-sonnet-4-20250514' });

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
