type MockupTask = {
  id: string;
  artworkId: string;
  artworkTitle: string;
  task: () => Promise<void>;
  resolve: (() => void) | null;
  reject: ((err: Error) => void) | null;
  addedAt: Date;
};

class MockupGenerationQueue {
  private queue: MockupTask[] = [];
  private processing = false;
  private processedCount = 0;
  private failedCount = 0;
  private activeArtworkId: string | null = null;
  private activeArtworkTitle: string | null = null;

  enqueue(
    artworkId: string,
    artworkTitle: string,
    task: () => Promise<void>,
    taskId?: string,
  ): void {
    const id = taskId || `mockup-${artworkId}-${Date.now()}`;
    this.queue.push({
      id, artworkId, artworkTitle, task,
      resolve: null, reject: null,
      addedAt: new Date(),
    });
    console.log(
      `[MockupQueue] Enqueued "${artworkTitle}" (${id}). Queue size: ${this.queue.length}, processing: ${this.processing}`,
    );
    this.processNext();
  }

  enqueueAsync(
    artworkId: string,
    artworkTitle: string,
    task: () => Promise<void>,
    taskId?: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const id = taskId || `mockup-${artworkId}-${Date.now()}`;
      this.queue.push({
        id, artworkId, artworkTitle, task,
        resolve, reject,
        addedAt: new Date(),
      });
      console.log(
        `[MockupQueue] Enqueued (awaitable) "${artworkTitle}" (${id}). Queue size: ${this.queue.length}, processing: ${this.processing}`,
      );
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    const item = this.queue.shift()!;
    this.processing = true;
    this.activeArtworkId = item.artworkId;
    this.activeArtworkTitle = item.artworkTitle;
    const waitMs = Date.now() - item.addedAt.getTime();
    console.log(
      `[MockupQueue] Starting "${item.artworkTitle}" (${item.id}). Waited ${waitMs}ms. Remaining: ${this.queue.length}`,
    );

    try {
      await item.task();
      this.processedCount++;
      console.log(
        `[MockupQueue] Completed "${item.artworkTitle}". Total processed: ${this.processedCount}`,
      );
      if (item.resolve) item.resolve();
    } catch (err) {
      this.failedCount++;
      console.error(`[MockupQueue] Failed "${item.artworkTitle}":`, err);
      if (item.reject) item.reject(err as Error);
    } finally {
      this.processing = false;
      this.activeArtworkId = null;
      this.activeArtworkTitle = null;

      if (global.gc) {
        try {
          global.gc();
        } catch (_) {}
      }

      if (this.queue.length > 0) {
        setTimeout(() => this.processNext(), 1000);
      }
    }
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      activeArtworkId: this.activeArtworkId,
      activeArtworkTitle: this.activeArtworkTitle,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      pending: this.queue.map((t) => ({
        id: t.id,
        artworkId: t.artworkId,
        title: t.artworkTitle,
        waitingMs: Date.now() - t.addedAt.getTime(),
      })),
    };
  }

  isArtworkQueued(artworkId: string): boolean {
    if (this.activeArtworkId === artworkId) return true;
    return this.queue.some((t) => t.artworkId === artworkId);
  }
}

export const mockupQueue = new MockupGenerationQueue();
