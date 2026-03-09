import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const PROJECT_ROOT = join(import.meta.dirname, "..");
const HOOKS_DIR = join(PROJECT_ROOT, "hooks");
const LOCK_FILE = join(PROJECT_ROOT, "ccpoke-lock.json");

interface LockEntry {
  hash: string;
  version: string;
}

function computeHash(filePath: string): string {
  const content = readFileSync(filePath);
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function collectHookFiles(dir: string, base: string = dir): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectHookFiles(fullPath, base));
    } else if (entry.isFile()) {
      files.push(relative(base, fullPath));
    }
  }

  return files.sort();
}

function main(): void {
  const version = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8")).version;
  const hookFiles = collectHookFiles(HOOKS_DIR);

  let existing: Record<string, LockEntry> = {};
  if (existsSync(LOCK_FILE)) {
    try {
      existing = JSON.parse(readFileSync(LOCK_FILE, "utf-8"));
    } catch {
      /* start fresh */
    }
  }

  const lockData: Record<string, LockEntry> = {};
  let changed = 0;

  for (const relPath of hookFiles) {
    const absPath = join(HOOKS_DIR, relPath);
    const hash = computeHash(absPath);
    const prev = existing[relPath];

    if (prev && prev.hash === hash) {
      lockData[relPath] = prev;
      console.log(`  ${relPath} → unchanged (v${prev.version})`);
    } else {
      lockData[relPath] = { hash, version };
      console.log(`  ${relPath} → ${hash.slice(0, 20)}... (v${version})`);
      changed++;
    }
  }

  writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2) + "\n");

  console.log(
    `\n✓ ccpoke-lock.json updated (${hookFiles.length} files, ${changed} changed)`
  );
}

main();
