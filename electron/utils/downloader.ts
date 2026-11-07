import { createReadStream, promises as fs } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import axios from 'axios';
import { LogService } from '../services/LogService';

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

    try {
      await fs.mkdir(destinationFolder, { recursive: true });

      // Downloads from some CDNs are flaky (connection resets mid-transfer).
      // Retry a few times before surfacing a failure to the user.
      let lastError: unknown;
      const attempts = 3;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          result = await this.handleSingleDownload(url, destinationFolder, options);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (options?.signal?.aborted) break;
          if (attempt < attempts) {
            const message = error instanceof Error ? error.message : String(error);
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
      const errorMessage = (error instanceof Error ? error.message : String(error)) || 'Unknown error';
      this.logger.error(`Failed to download ${url}: ${errorMessage}`, 'Downloader');
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

    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      options?.onProgress?.({ url, filePath, downloadedBytes, totalBytes });
    });

    await new Promise<void>((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => resolve());
      writer.on('error', reject);
      options?.signal?.addEventListener('abort', () => {
        writer.destroy();
        reject(new Error('Download aborted'));
      });
    });

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