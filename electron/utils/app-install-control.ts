export class AppInstallControl {
  private state: 'installing' | 'paused' | 'aborting' = 'installing';
  private resumePromise: Promise<void> | null = null;
  private resolveResume: (() => void) | null = null;
  private readonly pauseListeners = new Set<(paused: boolean) => void>();
  private readonly abortController = new AbortController();
  private readonly completion: Promise<void>;
  private resolveCompletion!: () => void;

  constructor() {
    this.completion = new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });
  }

  get status(): 'installing' | 'paused' | 'aborting' {
    return this.state;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  pause(): void {
    if (this.state !== 'installing') return;
    this.state = 'paused';
    this.resumePromise = new Promise((resolve) => {
      this.resolveResume = resolve;
    });
    for (const listener of this.pauseListeners) listener(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'installing';
    for (const listener of this.pauseListeners) listener(false);
    this.resolveResume?.();
    this.resolveResume = null;
    this.resumePromise = null;
  }

  abort(): void {
    if (this.state === 'aborting') return;
    this.state = 'aborting';
    this.abortController.abort();
    for (const listener of this.pauseListeners) listener(false);
    this.resolveResume?.();
    this.resolveResume = null;
    this.resumePromise = null;
  }

  async waitUntilResumed(): Promise<void> {
    while (this.state === 'paused') {
      await this.resumePromise;
    }
    this.throwIfAborted();
  }

  throwIfAborted(): void {
    if (this.signal.aborted) throw new Error('Installation aborted');
  }

  onPauseChange(listener: (paused: boolean) => void): () => void {
    this.pauseListeners.add(listener);
    if (this.state === 'paused') listener(true);
    return () => this.pauseListeners.delete(listener);
  }

  finish(): void {
    this.resolveCompletion();
  }

  waitForFinish(): Promise<void> {
    return this.completion;
  }
}
