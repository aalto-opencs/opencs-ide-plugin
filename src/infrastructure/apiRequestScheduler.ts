export type ApiRequestPriority = 'foreground' | 'background';

interface QueuedRequest {
  start(): void;
}

/** Limits API request concurrency for one extension instance. */
export class ApiRequestScheduler {
  private readonly foregroundQueue: QueuedRequest[] = [];
  private readonly backgroundQueue: QueuedRequest[] = [];
  private inFlight = 0;
  private backgroundInFlight = 0;

  public schedule<T>(
    priority: ApiRequestPriority,
    operation: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
        start: () => {
          this.inFlight += 1;
          if (priority === 'background') {
            this.backgroundInFlight += 1;
          }
          void Promise.resolve()
            .then(operation)
            .then(resolve, reject)
            .finally(() => {
              this.inFlight -= 1;
              if (priority === 'background') {
                this.backgroundInFlight -= 1;
              }
              this.startQueuedRequests();
            });
        },
      };

      const queue = priority === 'foreground'
        ? this.foregroundQueue
        : this.backgroundQueue;
      queue.push(request);
      this.startQueuedRequests();
    });
  }

  private startQueuedRequests(): void {
    while (this.inFlight < 3) {
      const request = this.foregroundQueue.shift() ??
        (this.backgroundInFlight < 2
          ? this.backgroundQueue.shift()
          : undefined);
      if (!request) {
        return;
      }
      request.start();
    }
  }
}
