import type { Middleware, Message } from '@sisu/core';
export const inputToMessage: Middleware = async (ctx, next) => {
  if (ctx.input) ctx.messages.push({ role: 'user', content: ctx.input });
  await next();
};
export const conversationBuffer = ({ window = 12 }: { window?: number } = {}): Middleware => async (ctx, next) => {
  if (ctx.messages.length > window) {
    const head = ctx.messages.slice(0,1);
    const tail = ctx.messages.slice(-window);
    ctx.messages = head.concat(tail as Message[]) as any;
  }
  await next();
};