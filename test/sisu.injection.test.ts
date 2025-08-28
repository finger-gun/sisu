import { describe, it, expect } from 'vitest';
import { sisu, type Config } from '../src/index';
import type { Message } from '../src/types/messages';

function captureMessages<R>(fn: (messages: Message[], model: string) => Promise<R>) {
  const calls: Message[][] = [];
  const wrapped = async (messages: Message[], model: string) => {
    calls.push(messages);
    return fn(messages, model);
  };
  return { wrapped, calls } as const;
}

describe('system injection behavior', () => {
  it('injects system when configured and first message is not system', async () => {
    const config: Config = { model: 'm', system: 'You are helpful.' };
    const { wrapped, calls } = captureMessages(async () => ({ ok: true } as any));
    const client = sisu(config, wrapped);
    await client.request('Hello');
    expect(calls[0][0].role).toBe('system');
    expect(calls[0][0]).toMatchObject({ role: 'system', content: 'You are helpful.' });
  });

  it('does not inject system when opts.injectSystem=false', async () => {
    const config: Config = { model: 'm', system: 'You are helpful.' };
    const { wrapped, calls } = captureMessages(async () => ({ ok: true } as any));
    const client = sisu(config, wrapped);
    await client.request('Hello', { injectSystem: false });
    expect(calls[0][0].role).toBe('user');
  });

  it('does not duplicate when first message is already system', async () => {
    const config: Config = { model: 'm', system: 'Base system.' };
    const { wrapped, calls } = captureMessages(async () => ({ ok: true } as any));
    const client = sisu(config, wrapped);
    await client.request([{ role: 'system', content: 'Custom system' }, { role: 'user', content: 'Hi' }]);
    expect(calls[0][0]).toMatchObject({ role: 'system', content: 'Custom system' });
    expect(calls[0].filter(m => m.role === 'system').length).toBe(1);
  });
});

