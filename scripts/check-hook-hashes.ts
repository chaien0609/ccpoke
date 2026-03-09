import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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
      files.push(relative(base, fullPath).replace(/\\/g, "/"));
    }
  }

  return files.sort();
}

function main(): void {
  let lockData: Record<string, LockEntry>;

  try {
    lockData = JSON.parse(readFileSync(LOCK_FILE, "utf-8"));
  } catch {
    console.error("✗ ccpoke-lock.json not found. Run: pnpm hash:update");
    process.exit(1);
  }

  const hookFiles = collectHookFiles(HOOKS_DIR);
  const errors: string[] = [];

  const missingInLock = hookFiles.filter((f) => !lockData[f]);
  if (missingInLock.length > 0) {
    errors.push(`Missing from ccpoke-lock.json: ${missingInLock.join(", ")}`);
  }

  const staleInLock = Object.keys(lockData).filter((f) => !hookFiles.includes(f));
  if (staleInLock.length > 0) {
    errors.push(`Stale entries in ccpoke-lock.json: ${staleInLock.join(", ")}`);
  }

  for (const relPath of hookFiles) {
    const absPath = join(HOOKS_DIR, relPath);
    const currentHash = computeHash(absPath);
    const entry = lockData[relPath];

    if (entry && currentHash !== entry.hash) {
      errors.push(`Hash mismatch: ${relPath}`);
    }
  }

  if (errors.length > 0) {
    console.error("✗ Hook hash check failed:");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    console.error("\nRun: pnpm hash:update");
    process.exit(1);
  }

  console.log(`✓ Hook hashes verified (${hookFiles.length} files)`);
}

main();
