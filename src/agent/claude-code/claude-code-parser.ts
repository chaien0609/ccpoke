import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { expandHome, paths } from "../../utils/paths.js";

export function extractProjectName(cwd: string, transcriptPath: string): string {
  if (transcriptPath) {
    const expanded = expandHome(transcriptPath);
    if (expanded.startsWith(`${paths.claudeProjectsDir}/`)) {
      const encodedDir = expanded.slice(`${paths.claudeProjectsDir}/`.length).split("/")[0];
      if (encodedDir) {
        const projectPath = resolveProjectPath(encodedDir, cwd);
        if (projectPath) return basename(projectPath);
      }
    }
  }
  return basename(cwd);
}

function resolveProjectPath(encodedDir: string, cwd: string): string | null {
  const encodedCwd = encodePathSegment(cwd);
  if (encodedDir === encodedCwd) return cwd;

  if (encodedDir.startsWith(encodedCwd)) return cwd;
  if (encodedCwd.startsWith(encodedDir)) return cwd;

  return null;
}

function encodePathSegment(absolutePath: string): string {
  return absolutePath.replaceAll("/", "-");
}

interface TranscriptEntry {
  type?: string;
  message?: MessageContent;
  timestamp?: string;
  summary?: string;
}

interface MessageContent {
  role: string;
  content?: ContentPart[];
  model?: string;
}

interface ContentPart {
  type: string;
  text?: string;
}

export interface StopEvent {
  session_id: string;
  transcript_path: string;
  cwd: string;
}

export interface TranscriptSummary {
  lastAssistantMessage: string;
  model: string;
}

export function isValidStopEvent(data: unknown): data is StopEvent {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.session_id === "string" &&
    typeof obj.transcript_path === "string" &&
    typeof obj.cwd === "string"
  );
}

export function parseTranscript(transcriptPath: string): TranscriptSummary {
  const expandedPath = expandHome(transcriptPath);

  let raw: string;
  try {
    raw = readFileSync(expandedPath, "utf-8");
  } catch {
    return { lastAssistantMessage: "", model: "" };
  }

  const lines = raw.split("\n");

  let lastAssistantText = "";
  let summaryText = "";
  let model = "";

  for (const line of lines) {
    if (!line.trim()) continue;

    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type === "summary" && entry.summary) {
      summaryText = entry.summary;
    }

    const msg = entry.message;
    if (msg?.role === "user") {
      lastAssistantText = "";
      model = "";
    }

    if (msg?.role === "assistant") {
      const rawContent = msg.content ?? [];
      const contentArray = Array.isArray(rawContent) ? rawContent : [];
      const text = extractTextFromContent(contentArray);
      if (text) lastAssistantText = text;

      if (msg.model) model = msg.model;
    }
  }

  const finalMessage = lastAssistantText || summaryText;

  return {
    lastAssistantMessage: finalMessage,
    model,
  };
}

function extractTextFromContent(parts: ContentPart[]): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n");
}
