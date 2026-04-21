/**
 * Upload Queue - Processes artwork uploads one at a time to prevent memory exhaustion
 * 
 * With 2GB RAM and large artwork files (50-100MB+), processing multiple uploads
 * simultaneously can crash the server. This queue ensures only one upload
 * processes at a time.
 */

type QueuedTask<T> = {
  id: string;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  addedAt: Date;
};

class UploadQueue {
  private queue: QueuedTask<any>[] = [];
  private isProcessing = false;
  private maxConcurrent = 1; // Process one at a time
  private currentProcessing = 0;
  private processedCount = 0;
  private failedCount = 0;

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add a task to the queue and wait for it to complete
   */
  async enqueue<T>(task: () => Promise<T>, taskId?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = taskId || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.queue.push({
        id,
        task,
        resolve,
        reject,
        addedAt: new Date()
      });

      console.log(`[UploadQueue] Task ${id} added to queue. Queue size: ${this.queue.length}, Processing: ${this.currentProcessing}`);
      
      this.processNext();
    });
  }

  private async processNext() {
    // Check if we can process more tasks
    if (this.currentProcessing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const queuedTask = this.queue.shift();
    if (!queuedTask) return;

    this.currentProcessing++;
    const waitTime = Date.now() - queuedTask.addedAt.getTime();
    console.log(`[UploadQueue] Starting task ${queuedTask.id}. Wait time: ${waitTime}ms. Queue remaining: ${this.queue.length}`);

    try {
      const result = await queuedTask.task();
      this.processedCount++;
      console.log(`[UploadQueue] Task ${queuedTask.id} completed successfully. Total processed: ${this.processedCount}`);
      queuedTask.resolve(result);
    } catch (error) {
      this.failedCount++;
      console.error(`[UploadQueue] Task ${queuedTask.id} failed:`, error);
      queuedTask.reject(error as Error);
    } finally {
      this.currentProcessing--;
      // Force garbage collection hint and delay to allow memory cleanup
      if (global.gc) {
        try {
          global.gc();
          console.log('[UploadQueue] Forced garbage collection after task');
        } catch (e) {
          // GC not available
        }
      }
      // Longer delay (500ms) to allow garbage collection between large image uploads
      setTimeout(() => this.processNext(), 500);
    }
  }

  /**
   * Get queue status for monitoring
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      currentProcessing: this.currentProcessing,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
   * Get position of a task in queue (0 = currently processing)
   */
  getPosition(taskId: string): number {
    if (this.currentProcessing > 0) {
      const index = this.queue.findIndex(t => t.id === taskId);
      return index === -1 ? -1 : index + 1;
    }
    return this.queue.findIndex(t => t.id === taskId);
  }
}

// Singleton instance for artwork uploads
export const artworkUploadQueue = new UploadQueue(1);

// Export class for testing or custom instances
export { UploadQueue };
