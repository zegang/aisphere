// Shared helpers for exporting / importing spec files (app 说明 and runtime
// 配置): timestamped file naming, ZIP packaging and archive/folder walking.
// ZIP is done with the built-in PowerShell cmdlets so no extra dependency is
// required; paths are single-quote escaped to prevent command injection.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { mkdirSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);

/** `20261107-225930` style local timestamp for export names. */
export function fileStamp(date = new Date()): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** ASCII-safe slug of a display name for use inside file names. */
export function slugName(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

function powershellPath(): string {
  return join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** ZIPs `folder` (the folder itself becomes the archive root). */
export async function compressDirectory(folder: string, zipPath: string): Promise<void> {
  const ps = (p: string) => p.replace(/'/g, "''");
  await execFileAsync(powershellPath(), [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `$ProgressPreference='SilentlyContinue'; Compress-Archive -Path '${ps(folder)}' -DestinationPath '${ps(zipPath)}' -CompressionLevel Optimal -Force`,
  ], { timeout: 120_000 });
}

/** Extracts a ZIP archive into `destination`. */
export async function extractArchive(zipPath: string, destination: string): Promise<void> {
  const ps = (p: string) => p.replace(/'/g, "''");
  await execFileAsync(powershellPath(), [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `$ProgressPreference='SilentlyContinue'; Expand-Archive -LiteralPath '${ps(zipPath)}' -DestinationPath '${ps(destination)}' -Force`,
  ], { timeout: 120_000 });
}

/** Collects every .json file below the given paths (files, folders, zips). */
export async function collectSpecJsonFiles(paths: string[]): Promise<{ files: string[]; tempDirs: string[] }> {
  const files: string[] = [];
  const tempDirs: string[] = [];

  for (const p of paths) {
    const st = statSync(p);
    if (st.isDirectory()) {
      // Walk recursively so zip-style nested folders are covered too.
      for (const entry of readdirSync(p, { recursive: true }) as string[]) {
        const full = join(p, entry);
        try {
          if (statSync(full).isFile() && /\.json$/i.test(entry)) files.push(full);
        } catch {
          // Raced file, ignore.
        }
      }
    } else if (/\.zip$/i.test(p)) {
      const dest = join(tmpdir(), `aisphere-import-${Date.now()}`);
      mkdirSync(dest, { recursive: true });
      tempDirs.push(dest);
      await extractArchive(p, dest);
      for (const entry of readdirSync(dest, { recursive: true }) as string[]) {
        const full = join(dest, entry);
        try {
          if (statSync(full).isFile() && /\.json$/i.test(entry)) files.push(full);
        } catch {
          // Raced file, ignore.
        }
      }
    } else if (/\.json$/i.test(p)) {
      files.push(p);
    }
  }

  return { files, tempDirs };
}
