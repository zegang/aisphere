// Built-in runtime configuration (内置运行时配置).
//
// Runtimes can ship a JSON definition under `resources/runtimes` (one file per
// runtime). In packaged builds the `resources` folder is copied next to the
// executable, so the files live under `process.resourcesPath/runtimes`; in dev
// they are read from the project folder. The RuntimeService uses these entries
// for install artifacts (URL / file name / arguments), engine commands and the
// defaults surfaced by the runtime-config export.

import { join } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import type { RuntimeKind } from '../../src/shared/channel-types';

export interface BuiltInRuntimeInstallTarget {
  /** Download URL for this platform/arch. */
  url: string;
  /** Name the download is stored under. */
  fileName: string;
  /** Installer arguments; `{runtimeDir}` is replaced with the managed folder. */
  args?: string[];
  /** Interpreter used to execute the artifact on Linux (e.g. `sh`). */
  runner?: string;
}

export interface BuiltInRuntimeInstall {
  windows?: Record<string, BuiltInRuntimeInstallTarget>;
  linux?: Record<string, BuiltInRuntimeInstallTarget>;
  macos?: Record<string, BuiltInRuntimeInstallTarget>;
}

export interface BuiltInRuntimeEngine {
  /** Executable name inside the runtime folder (e.g. `docker.exe`). */
  binary?: string;
  /** Arguments that stop the engine (e.g. `['desktop', 'stop']`). */
  stop?: string[];
  /** Arguments that report the engine server version. */
  info?: string[];
}

export interface BuiltInRuntimeConfig {
  type: RuntimeKind;
  name: string;
  hasEngine: boolean;
  /** Default autoStart preference when the user never chose one. */
  autoStart: 'always' | 'never' | null;
  install?: BuiltInRuntimeInstall;
  engine?: BuiltInRuntimeEngine;
}

const SUPPORTED_TYPES: RuntimeKind[] = ['docker', 'podman', 'apptainer', 'conda'];

const CANDIDATES = [
  join(process.resourcesPath ?? '', 'runtimes'),
  join(process.cwd(), 'resources', 'runtimes'),
];

let cache: Map<string, BuiltInRuntimeConfig> | null = null;

function readTarget(raw: unknown): BuiltInRuntimeInstallTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.url !== 'string' || !obj.url) return null;
  return {
    url: obj.url,
    fileName: typeof obj.fileName === 'string' && obj.fileName ? obj.fileName : 'artifact',
    args: Array.isArray(obj.args) ? obj.args.filter((a): a is string => typeof a === 'string') : undefined,
    runner: typeof obj.runner === 'string' ? obj.runner : undefined,
  };
}

function readPlatform(raw: unknown): Record<string, BuiltInRuntimeInstallTarget> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, BuiltInRuntimeInstallTarget> = {};
  for (const [arch, target] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = readTarget(target);
    if (parsed) out[arch] = parsed;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalize(raw: unknown): BuiltInRuntimeConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, any>;
  const spec = obj.runtime && typeof obj.runtime === 'object' ? obj.runtime : obj;
  if (!spec || typeof spec.type !== 'string' || !SUPPORTED_TYPES.includes(spec.type as RuntimeKind)) {
    return null;
  }

  const type = spec.type as RuntimeKind;
  const autoStart = spec.autoStart === 'always' || spec.autoStart === 'never' ? spec.autoStart : null;
  const installRaw = spec.install && typeof spec.install === 'object' ? spec.install : undefined;
  const engineRaw = spec.engine && typeof spec.engine === 'object' ? spec.engine : undefined;

  return {
    type,
    name: typeof spec.name === 'string' && spec.name ? spec.name : type,
    hasEngine: typeof spec.hasEngine === 'boolean' ? spec.hasEngine : type === 'docker' || type === 'podman',
    autoStart,
    install: installRaw ? {
      windows: readPlatform(installRaw.windows),
      linux: readPlatform(installRaw.linux),
      macos: readPlatform(installRaw.macos),
    } : undefined,
    engine: engineRaw ? {
      binary: typeof engineRaw.binary === 'string' ? engineRaw.binary : undefined,
      stop: Array.isArray(engineRaw.stop) ? engineRaw.stop.filter((a: unknown): a is string => typeof a === 'string') : undefined,
      info: Array.isArray(engineRaw.info) ? engineRaw.info.filter((a: unknown): a is string => typeof a === 'string') : undefined,
    } : undefined,
  };
}

function load(): Map<string, BuiltInRuntimeConfig> {
  if (cache) return cache;
  cache = new Map();

  const dir = CANDIDATES.find((candidate) => existsSync(candidate));
  if (!dir) return cache;

  try {
    for (const entry of readdirSync(dir)) {
      if (!/\.json$/i.test(entry)) continue;
      const file = join(dir, entry);
      try {
        if (!statSync(file).isFile()) continue;
        const parsed = normalize(JSON.parse(readFileSync(file, 'utf8')));
        if (parsed) cache.set(parsed.type, parsed);
      } catch {
        // A malformed built-in file must never prevent the app from starting.
      }
    }
  } catch {
    // Unreadable directory: fall back to the hard-coded runtime definitions.
  }

  return cache;
}

/** All built-in runtime configurations shipped with the app. */
export function getBuiltInRuntimeConfigs(): BuiltInRuntimeConfig[] {
  return [...load().values()];
}

/** Built-in configuration for one runtime type, if one is bundled. */
export function getBuiltInRuntimeConfig(type: string): BuiltInRuntimeConfig | undefined {
  return load().get(type);
}

/**
 * Install artifact for the current (or given) platform/arch. Falls back to the
 * `x64` entry so a missing arch entry still has a usable default.
 */
export function getBuiltInRuntimeInstall(
  type: string,
  platform: string = process.platform,
  arch: string = process.arch,
): BuiltInRuntimeInstallTarget | undefined {
  const install = getBuiltInRuntimeConfig(type)?.install;
  if (!install) return undefined;
  const key = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
  const targets = install[key];
  if (!targets) return undefined;
  return targets[arch] ?? targets.x64 ?? Object.values(targets)[0];
}
