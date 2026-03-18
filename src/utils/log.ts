import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import pino, { type TransportTargetOptions } from "pino";

export const LOG_FILE = join(tmpdir(), "ccpoke-debug.log");
const MAX_LOG_SIZE = 2 * 1024 * 1024;

const fileOnly = process.env.LOG_FILE_ONLY === "1";
const level = process.env.LOG_LEVEL ?? "info";

function prepareLogFile(): boolean {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    if (statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      writeFileSync(LOG_FILE, "");
    }
    return true;
  } catch {
    return false;
  }
}

const fileReady = prepareLogFile();

const targets: TransportTargetOptions[] = [];

if (fileReady) {
  targets.push({
    target: "pino/file",
    options: { destination: LOG_FILE, append: true },
    level: "debug",
  });
}

if (!fileOnly) {
  targets.push({
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:HH:mm:ss" },
    level,
  });
}

export const logger = pino({ level: "debug", transport: { targets } });

export function flushLogger(cb?: () => void): void {
  logger.flush(cb);
}
