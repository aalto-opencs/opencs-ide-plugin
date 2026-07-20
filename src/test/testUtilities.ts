import { AddressInfo } from 'net';
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'http';
import * as vscode from 'vscode';

export class InMemoryMemento implements vscode.Memento {
  private readonly values = new Map<string, unknown>();

  public keys(): readonly string[] {
    return [...this.values.keys()];
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.get(key) as T | undefined) ?? defaultValue;
  }

  public async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
      return;
    }
    this.values.set(key, value);
  }
}

export class InMemorySecretStorage implements vscode.SecretStorage {
  private readonly values = new Map<string, string>();
  private readonly changeEmitter =
    new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();

  public readonly onDidChange = this.changeEmitter.event;

  public async keys(): Promise<string[]> {
    return [...this.values.keys()];
  }

  public async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  public async store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    this.changeEmitter.fire({ key });
  }

  public async delete(key: string): Promise<void> {
    this.values.delete(key);
    this.changeEmitter.fire({ key });
  }

  public corruptStoredValue(value: string): void {
    const key = this.values.keys().next().value as string | undefined;

    if (key) {
      this.values.set(key, value);
    }
  }

  public get size(): number {
    return this.values.size;
  }
}

export interface TestHttpServer {
  baseUrl: string;
  close(): Promise<void>;
}

export async function startTestHttpServer(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void,
): Promise<TestHttpServer> {
  const server = createServer(handler);

  await listen(server);

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => close(server),
  };
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
