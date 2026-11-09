export enum SettingKey {
  Language = 'language',
  Theme = 'theme',
  RootDirectory = 'rootdir',
  ConfigDirectory = 'configdir',
  DataDirectory = 'datadir',
  DownloadDirectory = 'downloaddir',
  RuntimeAutoInstall = 'runtime.autoInstall',
  /** Ordered, user-managed Docker Hub pull-through mirrors (JSON array). */
  DockerRegistryMirrors = 'runtime.docker.registryMirrors',
  /** @deprecated Single-mirror preference from older builds (migrated on read). */
  DockerRegistryMirror = 'runtime.docker.registryMirror',
  StopRuntimesOnExit = 'stopRuntimesOnExit',
}

/** One Docker Hub pull-through mirror in the user's ordered list. */
export interface DockerRegistryMirrorConfig {
  /** Normalized mirror URL, e.g. `https://docker.1ms.run` or `https://mirror.example.com/dockerhub`. */
  url: string;
  /** Disabled mirrors are kept in the list but skipped when pulling. */
  enabled: boolean;
}

/** Suggested mirrors offered as one-click additions in the runtime UI. */
export const DOCKER_REGISTRY_MIRRORS = [
  'https://docker.1ms.run',
  'https://docker.xuanyuan.me',
  'https://docker.m.daocloud.io',
] as const;

/**
 * Normalizes a user-supplied mirror address. Accepts a bare host
 * (`docker.1ms.run`) and assumes HTTPS; rejects credentials, query strings and
 * fragments. Returns the canonical `protocol://host[/path]` form, or undefined
 * when the value cannot be used as a registry mirror.
 */
export function normalizeDockerRegistryMirrorUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) return undefined;

  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.protocol}//${parsed.host}${path === '/' ? '' : path}`;
}

/** Coerces untrusted stored/imported data into a normalized mirror list. */
export function normalizeDockerRegistryMirrors(value: unknown): DockerRegistryMirrorConfig[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: DockerRegistryMirrorConfig[] = [];
  for (const item of value) {
    const rawUrl = typeof item === 'string'
      ? item
      : item && typeof item === 'object' ? (item as { url?: unknown }).url : undefined;
    const enabled = item && typeof item === 'object' && (item as { enabled?: unknown }).enabled === false
      ? false
      : true;
    const url = typeof rawUrl === 'string' ? normalizeDockerRegistryMirrorUrl(rawUrl) : undefined;
    if (!url) continue;

    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ url, enabled });
  }
  return result;
}

/**
 * Reads a mirror list from the setting/import value. Settings are stored as a
 * JSON string; older exports contain a single preset URL string instead.
 */
export function parseDockerRegistryMirrors(value: unknown): DockerRegistryMirrorConfig[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return normalizeDockerRegistryMirrors(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }
    return normalizeDockerRegistryMirrors([{ url: trimmed, enabled: true }]);
  }
  return normalizeDockerRegistryMirrors(value);
}

/**
 * Rewrites a Docker Hub image reference to pull through a mirror
 * (`nginx:latest` -> `docker.1ms.run/library/nginx:latest`). Returns undefined
 * for non-Docker-Hub images, digest references and invalid mirrors, which must
 * be pulled directly.
 */
export function getDockerHubMirrorImageReference(image: string, mirror: string): string | undefined {
  const normalizedMirror = normalizeDockerRegistryMirrorUrl(mirror);
  if (!normalizedMirror || image.includes('@')) return undefined;

  const slashIndex = image.indexOf('/');
  const firstSegment = slashIndex < 0 ? image : image.slice(0, slashIndex);
  const hasRegistry = slashIndex >= 0 && (firstSegment.includes('.') || firstSegment.includes(':') || firstSegment === 'localhost');
  const isDockerHub = !hasRegistry || firstSegment === 'docker.io' || firstSegment === 'index.docker.io';
  if (!isDockerHub) return undefined;

  const repository = hasRegistry ? image.slice(slashIndex + 1) : image;
  if (!repository) return undefined;
  const normalizedRepository = repository.includes('/') ? repository : `library/${repository}`;

  const parsedMirror = new URL(normalizedMirror);
  if (parsedMirror.host === firstSegment) return undefined;
  const path = parsedMirror.pathname.replace(/\/+$/, '');
  return `${parsedMirror.host}${path}/${normalizedRepository}`;
}

export enum Themes {
  Light = 'light',
  Dark = 'dark',
  System = 'system'
}
