import type { Writable } from 'node:stream';
import type { ChatEvent } from './events.js';

export interface ColorSupport {
  enabled: boolean;
  level: 0 | 1;
}

export function detectColorSupport(
  env: Record<string, string | undefined> = process.env,
  isTty = Boolean(process.stdout.isTTY),
): ColorSupport {
  if (env.NO_COLOR) {
    return { enabled: false, level: 0 };
  }

  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') {
    return { enabled: true, level: 1 };
  }

  if (!isTty) {
    return { enabled: false, level: 0 };
  }

  return { enabled: true, level: 1 };
}

interface Theme {
  muted: (text: string) => string;
  info: (text: string) => string;
  success: (text: string) => string;
  warning: (text: string) => string;
  error: (text: string) => string;
}

function wrap(code: string, text: string, enabled: boolean): string {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function createTheme(support: ColorSupport): Theme {
  return {
    muted: (text) => wrap('2', text, support.enabled),
    info: (text) => wrap('36', text, support.enabled),
    success: (text) => wrap('32', text, support.enabled),
    warning: (text) => wrap('33', text, support.enabled),
    error: (text) => wrap('31', text, support.enabled),
  };
}

export class TerminalRenderer {
  private readonly output: Writable;

  private readonly theme: Theme;

  private streamingMessageId?: string;

  constructor(options?: { output?: Writable; forceColor?: boolean; disableColor?: boolean }) {
    this.output = options?.output || process.stdout;
    const support: ColorSupport = options?.disableColor
      ? { enabled: false, level: 0 }
      : options?.forceColor
        ? { enabled: true, level: 1 }
        : detectColorSupport();

    this.theme = createTheme(support);
  }

  private writeLine(text: string): void {
    this.output.write(`${text}\n`);
  }

  render(event: ChatEvent): void {
    switch (event.type) {
      case 'user.submitted':
        this.writeLine(this.theme.info(`You: ${event.message.content}`));
        return;
      case 'assistant.message.started':
        this.streamingMessageId = event.message.id;
        this.output.write(this.theme.success('Assistant: '));
        return;
      case 'assistant.token.delta':
        if (this.streamingMessageId === event.messageId) {
          this.output.write(event.delta);
        }
        return;
      case 'assistant.message.completed':
        if (this.streamingMessageId === event.message.id) {
          this.output.write('\n');
          this.streamingMessageId = undefined;
          return;
        }
        this.writeLine(this.theme.success(`Assistant: ${event.message.content}`));
        return;
      case 'assistant.message.failed':
        this.writeLine(this.theme.error(`Assistant failed (${event.errorCode}): ${event.errorMessage}`));
        return;
      case 'assistant.message.cancelled':
        this.writeLine(this.theme.warning('Assistant response cancelled.'));
        return;
      case 'run.step.started':
        this.writeLine(this.theme.muted(`- Step started: ${event.step}`));
        return;
      case 'run.step.completed':
        this.writeLine(this.theme.muted(`OK Step complete: ${event.step}`));
        return;
      case 'tool.pending':
        this.writeLine(this.theme.muted(`- Tool pending [${event.record.toolName}]: ${event.record.requestPreview}`));
        return;
      case 'tool.running':
        this.writeLine(this.theme.info(`- Tool running [${event.record.toolName}]`));
        return;
      case 'tool.completed':
        this.writeLine(this.theme.success(`OK Tool completed [${event.record.toolName}]`));
        return;
      case 'tool.denied':
        this.writeLine(this.theme.warning(`! Tool denied [${event.record.toolName}]: ${event.reason}`));
        return;
      case 'tool.failed':
        this.writeLine(this.theme.error(`X Tool failed [${event.record.toolName}]: ${event.errorMessage}`));
        return;
      case 'tool.cancelled':
        this.writeLine(this.theme.warning(`! Tool cancelled [${event.record.toolName}]`));
        return;
      case 'run.completed':
        this.writeLine(this.theme.success(`Run complete (${event.summary.completedSteps} steps).`));
        return;
      case 'run.failed':
        this.writeLine(this.theme.error(`Run failed: ${event.errorCode} - ${event.errorMessage}`));
        return;
      case 'run.cancelled':
        this.writeLine(this.theme.warning('Run cancelled.'));
        return;
      case 'session.saved':
        this.writeLine(this.theme.muted('Session saved.'));
        return;
      case 'error.raised':
        this.writeLine(this.theme.error(`Error [${event.code}]: ${event.message}`));
        return;
      default:
        return;
    }
  }
}
