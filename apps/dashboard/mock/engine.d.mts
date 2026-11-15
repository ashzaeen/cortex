// Types for engine.mjs (plain JS so Node and the browser share it).
export type EngineEvent = { type: string; at: string; data: unknown };
export type EngineResponse = { status: number; body: unknown };
export type Engine = {
  handle(method: string, target: string, body?: unknown): EngineResponse;
  subscribe(fn: (e: EngineEvent) => void): () => void;
  tick(ref?: Date): unknown[];
  stop(): void;
};
export type EngineOptions = {
  load: () => Record<string, unknown[]>;
  anchor?: string | null;
  suggestions?: boolean;
  owner?: { name: string; email?: string } | null;
  assets?: { booth?: string; card?: string };
};
export function createEngine(opts: EngineOptions): Engine;
