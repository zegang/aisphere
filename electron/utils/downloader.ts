import { createReadStream, promises as fs } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import axios from 'axios';
import { LogService } from '../services/LogService';
import { AppInstallControl } from './app-install-control';

export interface ChecksumOptions {
  algorithm: 'md5' | 'sha1' | 'sha256';
  value: string;
}

export interface DownloadOptions {
  /** Optional file name to use instead of the one derived from the URL. */
  filename?: string;
  /** Optional callback for download progress. */
  onProgress?: (progress: { url: string; filePath: string; downloadedBytes: number; totalBytes: number }) => void;
  /** Optional callback for when a single download completes. */
  onComplete?: (url: string, filePath: string) => void;
  /** Optional callback for when a single download fails. */
  onError?: (url: string, error: string) => void;
  /** AbortSignal to cancel downloads. */
  signal?: AbortSignal;
  /** Pauses the active network stream and blocks the next install step. */
  control?: AppInstallControl;
  /** Optional checksum verification. */
  checksum?: ChecksumOptions;
}

export interface DownloadResult {
  url: string;
  filePath: string | null;
  success: boolean;
  error?: string;
  checksumValidated?: boolean;
}

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  syscall?: unknown;
  hostname?: unknown;
  address?: unknown;
  port?: unknown;
  status?: unknown;
  statusText?: unknown;
  response?: { status?: unknown; statusText?: unknown };
  cause?: unknown;
  errors?: unknown;
}

/** `connect 1.2.3.4:443` for a low-level socket error, or an empty string. */
function formatErrorTarget(err: ErrorLike): string {
  const syscall = typeof err.syscall === 'string' ? err.syscall : '';
  const host = typeof err.hostname === 'string' && err.hostname
    ? err.hostname
    : typeof err.address === 'string'
      ? err.address
      : '';
  const port = typeof err.port === 'number' || typeof err.port === 'string' ? String(err.port) : '';
  const endpoint = host && port ? `${host}:${port}` : host;
  return [syscall, endpoint].filter(Boolean).join(' ');
}

/**
 * Collects every useful detail from an error raised while downloading.
 * Network failures often arrive as an AggregateError with an empty message
 * whose real causes live in nested `errors`/`cause` entries (e.g.
 * `connect ETIMEDOUT 31.13.94.41:443`). Without walking those the UI only had
 * "Unknown error" to show.
 */
function describeError(error: unknown, seen: Set<unknown> = new Set()): string[] {
  if (error === null || error === undefined) return [];
  if (typeof error === 'string') return error.trim() ? [error.trim()] : [];
  if (typeof error !== 'object') return [String(error)];
  if (seen.has(error)) return [];
  seen.add(error);

  const err = error as ErrorLike;
  const details: string[] = [];

  const response = err.response;
  if (response && typeof response.status === 'number') {
    const statusText = typeof response.statusText === 'string' && response.statusText ? ` ${response.statusText}` : '';
    details.push(`HTTP ${response.status}${statusText}`);
  } else if (typeof err.status === 'number') {
    const statusText = typeof err.statusText === 'string' && err.statusText ? ` ${err.statusText}` : '';
    details.push(`HTTP ${err.status}${statusText}`);
  }

  const message = typeof err.message === 'string' ? err.message.trim() : '';
  if (message) details.push(message);

  const children: unknown[] = [];
  if (Array.isArray(err.errors)) children.push(...err.errors);
  if (err.cause !== undefined) children.push(err.cause);

  if (children.length > 0) {
    // Parent wrappers (AggregateError/AxiosError) usually only repeat the
    // child code, so recurse and let the leaves describe the real failure.
    for (const child of children) details.push(...describeError(child, seen));
  } else if (typeof err.code === 'string' && err.code) {
    // Prefer the message when it already spells out the code (e.g.
    // "connect ETIMEDOUT 1.2.3.4:443") to avoid duplicating it.
    if (!message.includes(err.code)) {
      const target = formatErrorTarget(err);
      details.push(target ? `${err.code} (${target})` : err.code);
    }
  } else if (typeof err.syscall === 'string' && err.syscall) {
    details.push(formatErrorTarget(err));
  } else if (!message && typeof err.name === 'string' && err.name && err.name !== 'Error') {
    details.push(err.name);
  }

  return details;
}

/** Human-readable, deduplicated description of a download failure. */
export function describeDownloadError(error: unknown): string {
  const details = [...new Set(describeError(error).filter((item) => item.length > 0))];
  return details.length > 0 ? details.join(' | ') : 'Unknown error';
}

export class Downloader {
  private logger: LogService;

  constructor(logger: LogService) {
    this.logger = logger;
  }

  async download(url: string, destinationFolder: string, options?: DownloadOptions): Promise<DownloadResult> {
    let result: DownloadResult = { 
      url, 
      filePath: null, 
      success: false, 
      checksumValidated: false,
      error: undefined
    };

    this.logger.info(`Starting download for ${url}`, 'Downloader');
    if (options?.signal?.aborted) {
      this.logger.warn(`Download aborted for ${url}`, 'Downloader');
      result.error = 'Download aborted';
      options?.onError?.(url, result.error);
      return result;
    }

    const attempts = 3;
    try {
      await fs.mkdir(destinationFolder, { recursive: true });

      // Downloads from some CDNs are flaky (connection resets mid-transfer).
      // Retry a few times before surfacing a failure to the user.
      let lastError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          result = await this.handleSingleDownload(url, destinationFolder, options);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (options?.signal?.aborted) break;
          if (attempt < attempts) {
            const message = describeDownloadError(error);
            this.logger.warn(`Download attempt ${attempt}/${attempts} failed for ${url}: ${message}. Retrying...`, 'Downloader');
            await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
          }
        }
      }
      if (lastError) {
        throw lastError;
      }

      if (result.success && result.filePath && options?.checksum) {
        const isValid = await this.verifyChecksum(result.filePath, options.checksum);
        if (!isValid) {
          result.success = false;
          result.error = 'Checksum verification failed';
          result.checksumValidated = false;
          options?.onError?.(url, result.error);
        } else {
          result.checksumValidated = true;
        }
      }
    } catch (error: any) {
      const aborted = options?.signal?.aborted === true;
      const detail = aborted ? 'Download aborted' : describeDownloadError(error);
      const errorMessage = aborted ? detail : `Could not download ${url}: ${detail}`;
      this.logger.error(`Failed to download ${url} after ${attempts} attempt(s): ${detail}`, 'Downloader');
      result.success = false;
      result.error = errorMessage;
      result.filePath = null;
      result.checksumValidated = false;
      options?.onError?.(url, result.error);
    }
    
    return result;
  }

  /**
   * Downloads a list of URLs to a specified destination folder.
   * @param urls An array of URLs to download.
   * @param destinationFolder The folder where files will be saved.
   * @param options Optional download options.
   * @returns A promise that resolves to an array of DownloadResult for each URL.
   */
  async downloads(urls: string[], destinationFolder: string, options?: DownloadOptions): Promise<DownloadResult[]> {
    await fs.mkdir(destinationFolder, { recursive: true });
    const results: DownloadResult[] = [];

    for (const url of urls) {
      const result = await this.download(url, destinationFolder, options);
      results.push(result);
    }

    return results;
  }

  private async handleSingleDownload(url: string, destinationFolder: string, options?: DownloadOptions): Promise<DownloadResult> {
    const urlObj = new URL(url);
    const filename =
      options?.filename ||
      decodeURIComponent(basename(urlObj.pathname)) ||
      `download_${Date.now()}`;
    const filePath = join(destinationFolder, filename);

    switch (urlObj.protocol) {
      case 'file:': {
        // Windows file URLs produce pathname '/D:/…'; strip the leading slash
        // so the path resolves to 'D:/…' instead of 'D:\D:\…'.
        const filePathArg = decodeURIComponent(urlObj.pathname).replace(/^\/(?=[A-Za-z]:)/, '');
        return this.downloadFromFile(filePathArg, filePath, url, options);
      }
      case 'http:':
      case 'https:':
        return this.downloadFromHttp(url, filePath, options);
      case 'p2p:':
        this.logger.warn(`P2P download protocol not fully supported yet: ${url}`, 'Downloader');
        // Simulate a successful download for now
        // await new Promise(resolve => setTimeout(1000)); // Simulate network delay
        await fs.writeFile(filePath, `Simulated P2P content for ${url}`);
        options?.onComplete?.(url, filePath);
        return { url, filePath, success: true };
      default:
        throw new Error(`Unsupported protocol: ${urlObj.protocol}`);
    }
  }

  private async downloadFromFile(sourcePath: string, destinationPath: string, originalUrl: string, options?: DownloadOptions): Promise<DownloadResult> {
    this.logger.info(`Copying file from ${sourcePath} to ${destinationPath}`, 'Downloader');
    try {
      await fs.copyFile(sourcePath, destinationPath);
      options?.onComplete?.(originalUrl, destinationPath);
      return { url: originalUrl, filePath: destinationPath, success: true };
    } catch (error: any) {
      throw new Error(`File copy failed: ${error.message}`);
    }
  }

  private async downloadFromHttp(url: string, filePath: string, options?: DownloadOptions): Promise<DownloadResult> {
    this.logger.info(`Downloading from HTTP/HTTPS: ${url} to ${filePath}`, 'Downloader');
    const writer = (await fs.open(filePath, 'w')).createWriteStream();
    let downloadedBytes = 0;

    const response = await axios({ method: 'get', url: url, responseType: 'stream', signal: options?.signal });
    const totalBytes = parseInt(String(response.headers['content-length'] ?? '0'), 10) || 0;
    const removePauseListener = options?.control?.onPauseChange((paused) => {
      if (paused) response.data.pause();
      else response.data.resume();
    });

    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      options?.onProgress?.({ url, filePath, downloadedBytes, totalBytes });
    });

    let rejectDownload: (error: Error) => void = () => undefined;
    const onAbort = () => {
      writer.destroy();
      rejectDownload(new Error('Download aborted'));
    };
    try {
      await new Promise<void>((resolve, reject) => {
        rejectDownload = reject;
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        options?.signal?.addEventListener('abort', onAbort, { once: true });
        if (options?.signal?.aborted) onAbort();
      });
      await options?.control?.waitUntilResumed();
    } finally {
      removePauseListener?.();
      options?.signal?.removeEventListener('abort', onAbort);
    }

    options?.onComplete?.(url, filePath);
    return { url, filePath, success: true };
  }

  private async verifyChecksum(filePath: string, options: ChecksumOptions): Promise<boolean> {
    this.logger.info(`Verifying ${options.algorithm} checksum for ${filePath}`, 'Downloader');
    const hash = createHash(options.algorithm);
    const stream = createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => {
        const calculated = hash.digest('hex');
        const match = calculated.toLowerCase() === options.value.toLowerCase();
        if (!match) {
          this.logger.error(`Checksum mismatch for ${filePath}. Expected: ${options.value}, Got: ${calculated}`, 'Downloader');
        }
        resolve(match);
      });
      stream.on('error', reject);
    });
  }
}