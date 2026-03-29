import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ChatEvent, ChatMessage, ChatRun, ToolExecutionRecord } from './events.js';

export interface SessionLineage {
  parentSessionId?: string;
  parentMessageId?: string;
}

export interface ChatSessionSnapshot {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  runs: ChatRun[];
  toolExecutions: ToolExecutionRecord[];
  events: ChatEvent[];
  lineage?: SessionLineage;
}

interface SessionStoreFile {
  version: 1;
  sessions: Record<string, ChatSessionSnapshot>;
}

export interface SessionStoreSearchResult {
  sessionId: string;
  title: string;
  updatedAt: string;
  preview: string;
}

export class FileSessionStore {
  private readonly rootDir: string;

  private readonly dataFile: string;

  constructor(storageDir?: string) {
    const root = storageDir || path.join(os.homedir(), '.sisu', 'chat-sessions', 'default');
    this.rootDir = path.resolve(root);
    this.dataFile = path.join(this.rootDir, 'sessions.json');
  }

  getStorageDir(): string {
    return this.rootDir;
  }

  private async readStoreFile(): Promise<SessionStoreFile> {
    await fs.mkdir(this.rootDir, { recursive: true });

    try {
      const content = await fs.readFile(this.dataFile, 'utf8');
      const parsed = JSON.parse(content) as SessionStoreFile;
      if (parsed.version !== 1 || !parsed.sessions || typeof parsed.sessions !== 'object') {
        throw new Error('Invalid session store schema.');
      }
      return parsed;
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
        return { version: 1, sessions: {} };
      }
      throw error;
    }
  }

  private async writeStoreFile(file: SessionStoreFile): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
    await fs.writeFile(this.dataFile, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  }

  async saveSession(snapshot: ChatSessionSnapshot): Promise<void> {
    const file = await this.readStoreFile();
    file.sessions[snapshot.sessionId] = snapshot;
    await this.writeStoreFile(file);
  }

  async getSession(sessionId: string): Promise<ChatSessionSnapshot> {
    const file = await this.readStoreFile();
    const session = file.sessions[sessionId];
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return session;
  }

  async listSessions(): Promise<ChatSessionSnapshot[]> {
    const file = await this.readStoreFile();
    return Object.values(file.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async searchSessions(query: string): Promise<SessionStoreSearchResult[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const sessions = await this.listSessions();
    const results: SessionStoreSearchResult[] = [];

    for (const session of sessions) {
      const searchable = [session.title, ...session.messages.map((message) => message.content)].join('\n').toLowerCase();
      if (!searchable.includes(normalized)) {
        continue;
      }
      const previewMessage = session.messages.find((message) => message.content.toLowerCase().includes(normalized));
      results.push({
        sessionId: session.sessionId,
        title: session.title,
        updatedAt: session.updatedAt,
        preview: previewMessage?.content.slice(0, 140) || session.title,
      });
    }

    return results;
  }

  async branchSession(sourceSessionId: string, sourceMessageId: string, nowIso: string): Promise<ChatSessionSnapshot> {
    const source = await this.getSession(sourceSessionId);
    const sourceIndex = source.messages.findIndex((message) => message.id === sourceMessageId);
    if (sourceIndex === -1) {
      throw new Error(`Unknown source message ${sourceMessageId} in session ${sourceSessionId}`);
    }

    const branchMessages = source.messages.slice(0, sourceIndex + 1);
    const branchSessionId = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshot: ChatSessionSnapshot = {
      sessionId: branchSessionId,
      title: `${source.title} (branch)`,
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: branchMessages,
      runs: [],
      toolExecutions: [],
      events: [],
      lineage: {
        parentSessionId: sourceSessionId,
        parentMessageId: sourceMessageId,
      },
    };

    await this.saveSession(snapshot);
    return snapshot;
  }
}
