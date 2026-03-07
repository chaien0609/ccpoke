import { existsSync, readFileSync } from "node:fs";

import { ApiRoute } from "../../utils/constants.js";
import { getPackageVersion, paths } from "../../utils/paths.js";
import { AgentName } from "../types.js";

export interface GeminiHookCommand {
  name: string;
  type: string;
  command: string;
  timeout: number;
}

export interface GeminiHookEntry {
  matcher?: string;
  hooks: GeminiHookCommand[];
}

export interface GeminiSettings {
  hooks?: Record<string, GeminiHookEntry[]>;
  [key: string]: unknown;
}

export interface HookEventConfig {
  event: string;
  scriptPath: string;
  hookName: string;
  matcher: string;
  route: string;
  timeout: number;
}

const VERSION_HEADER_PATTERN = /^#\s*ccpoke-version:\s*(\S+)/;
const VERSION_HEADER_PATTERN_WIN = /^@REM\s+ccpoke-version:\s*(\S+)/;
const CCPOKE_MARKER = "ccpoke";
const AGENT_PARAM = `?agent=${AgentName.GeminiCli}`;

export function buildHookConfigs(): HookEventConfig[] {
  return [
    {
      event: "AfterAgent",
      scriptPath: paths.geminiStopScript,
      hookName: "ccpoke-stop",
      matcher: "*",
      route: ApiRoute.HookStop + AGENT_PARAM,
      timeout: 5000,
    },
    {
      event: "SessionStart",
      scriptPath: paths.geminiSessionStartScript,
      hookName: "ccpoke-session-start",
      matcher: "startup",
      route: ApiRoute.HookSessionStart,
      timeout: 5000,
    },
    {
      event: "Notification",
      scriptPath: paths.geminiNotificationScript,
      hookName: "ccpoke-notification",
      matcher: "*",
      route: ApiRoute.HookNotification,
      timeout: 5000,
    },
  ];
}

export function hasCcpokeHook(entries: GeminiHookEntry[]): boolean {
  return entries.some((entry) =>
    entry.hooks?.some(
      (h) =>
        (typeof h.command === "string" && h.command.includes(CCPOKE_MARKER)) ||
        (typeof h.name === "string" && h.name.includes(CCPOKE_MARKER))
    )
  );
}

export function readScriptVersion(scriptPath: string): string | null {
  try {
    const lines = readFileSync(scriptPath, "utf-8").split("\n");
    for (const line of lines.slice(0, 3)) {
      const match = line.match(VERSION_HEADER_PATTERN) ?? line.match(VERSION_HEADER_PATTERN_WIN);
      if (match) return match[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function readGeminiSettings(): GeminiSettings {
  try {
    return JSON.parse(readFileSync(paths.geminiSettings, "utf-8"));
  } catch (err: unknown) {
    const isFileNotFound = err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT";
    if (isFileNotFound) return {};
    throw err;
  }
}

export function isScriptPresent(scriptPath: string): boolean {
  return existsSync(scriptPath);
}

export function isScriptCurrent(scriptPath: string): boolean {
  return readScriptVersion(scriptPath) === getPackageVersion();
}
