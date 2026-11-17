// Shared helpers for Kiro command hooks. Kiro passes a JSON payload on stdin;
// for PostFileSave it contains `file_path`. Paths are resolved against the repo
// root (the folder that contains this scripts/ directory), so the hook works
// whatever the hook process cwd is.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function readSavedFile() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let payload = {};
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return null;
  }
  const filePath = typeof payload.file_path === 'string' ? payload.file_path : null;
  if (!filePath) return null;
  const abs = path.resolve(payload.cwd ?? process.cwd(), filePath);
  const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
  if (rel.startsWith('..')) return null;
  return rel;
}

export function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
}