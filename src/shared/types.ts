export enum SettingKey {
  Language = 'language',
  Theme = 'theme',
  RootDirectory = 'rootdir',
  ConfigDirectory = 'configdir',
  DataDirectory = 'datadir',
  DownloadDirectory = 'downloaddir',
  RuntimeAutoInstall = 'runtime.autoInstall',
  DockerRegistryMirror = 'runtime.docker.registryMirror',
  StopRuntimesOnExit = 'stopRuntimesOnExit',
}

export const DOCKER_REGISTRY_MIRRORS = [
  'https://docker.1ms.run',
  'https://docker.xuanyuan.me',
  'https://docker.m.daocloud.io',
] as const;

export function getDockerHubMirrorImageReference(image: string, mirror: string): string | undefined {
  if (!(DOCKER_REGISTRY_MIRRORS as readonly string[]).includes(mirror) || image.includes('@')) return undefined;

  const slashIndex = image.indexOf('/');
  const firstSegment = slashIndex < 0 ? image : image.slice(0, slashIndex);
  const hasRegistry = slashIndex >= 0 && (firstSegment.includes('.') || firstSegment.includes(':') || firstSegment === 'localhost');
  const isDockerHub = !hasRegistry || firstSegment === 'docker.io' || firstSegment === 'index.docker.io';
  if (!isDockerHub) return undefined;

  const repository = hasRegistry ? image.slice(slashIndex + 1) : image;
  if (!repository) return undefined;
  const normalizedRepository = repository.includes('/') ? repository : `library/${repository}`;
  const mirrorHost = new URL(mirror).host;
  return `${mirrorHost}/${normalizedRepository}`;
}

export enum Themes {
  Light = 'light',
  Dark = 'dark',
  System = 'system'
}