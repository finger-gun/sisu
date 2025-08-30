import { compose, type Middleware } from './compose.js';
import type { Ctx } from './types.js';

export class Agent<C extends Ctx = Ctx> {
  private stack: Middleware<C>[] = [];
  use(mw: Middleware<C>) { this.stack.push(mw); return this; }
  handler() { return compose(this.stack); }
}
