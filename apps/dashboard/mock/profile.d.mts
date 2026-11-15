import type { EngineOptions } from "./engine.mjs";
export const ANCHOR: string;
export const PROFILE_FILES: string[];
export const ASSETS: { booth: string; card: string };
export function demoEngineOptions(files: Record<string, unknown>): EngineOptions;
export function seedExtras(engine: { handle(method: string, target: string, body?: unknown): unknown }, extras: unknown): void;
