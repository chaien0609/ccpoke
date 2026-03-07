import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { paths } from "../../utils/paths.js";

export interface GeminiAfterAgentEvent {
  sessionId: string;
  cwd: string;
  promptResponse: string;
  transcriptPath: string;
  timestamp: string;
}

export interface GeminiTranscriptUsage {
  model: string;
}

const EMPTY_USAGE: GeminiTranscriptUsage = {
  model: "",
};

export function isValidAfterAgentEvent(data: unknown): data is Record<string, unknown> {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.session_id === "string" && typeof obj.prompt_response === "string";
}

export function parseAfterAgentEvent(raw: Record<string, unknown>): GeminiAfterAgentEvent {
  return {
    sessionId: typeof raw.session_id === "string" ? raw.session_id : "",
    cwd: typeof raw.cwd === "string" ? raw.cwd : "",
    promptResponse: typeof raw.prompt_response === "string" ? raw.prompt_response : "",
    transcriptPath: typeof raw.transcript_path === "string" ? raw.transcript_path : "",
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : "",
  };
}

export function parseTranscriptForUsage(transcriptPath: string): GeminiTranscriptUsage {
  try {
    if (!transcriptPath) return EMPTY_USAGE;

    const resolved = resolve(transcriptPath);
    if (!paths.geminiDir) return EMPTY_USAGE;
    if (!resolved.startsWith(paths.geminiDir)) return EMPTY_USAGE;

    const content = readFileSync(resolved, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    let model = "";

    for (const line of lines) {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      if (typeof obj.model === "string" && obj.model) model = obj.model;
    }

    return { model };
  } catch {
    return EMPTY_USAGE;
  }
}

export function extractProjectName(cwd: string): string {
  return basename(cwd) || "unknown";
}
