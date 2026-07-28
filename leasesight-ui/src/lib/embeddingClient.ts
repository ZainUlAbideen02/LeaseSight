/**
 * Embedding Client Manager (embeddingClient.ts)
 * Wraps the embedding Web Worker with Promise-based API for main-thread consumption.
 */

import { ChildChunk } from './browserChunker';

export interface EmbeddingProgress {
  status: 'loading' | 'progress' | 'ready' | 'batch_progress' | 'complete' | 'error';
  device?: 'webgpu' | 'wasm';
  progress?: unknown;
  completed?: number;
  total?: number;
  percentage?: number;
  message?: string;
  error?: string;
}

export class EmbeddingClient {
  private worker: Worker | null = null;
  private isReady = false;
  private initPromise: Promise<void> | null = null;

  constructor(private workerPath: string = '/embeddingWorker.js') {}

  /**
   * Initializes the Web Worker.
   */
  public init(onProgress?: (info: EmbeddingProgress) => void): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        resolve();
        return;
      }

      try {
        this.worker = new Worker(this.workerPath, { type: 'module' });

        const handleMessage = (event: MessageEvent<EmbeddingProgress>) => {
          const data = event.data;

          if (onProgress) {
            onProgress(data);
          }

          if (data.status === 'ready') {
            this.isReady = true;
            resolve();
          } else if (data.status === 'error') {
            reject(new Error(data.error || 'Worker initialization failed'));
          }
        };

        this.worker.addEventListener('message', handleMessage);
        this.worker.postMessage({ action: 'init' });
      } catch (err) {
        reject(err);
      }
    });

    return this.initPromise;
  }

  /**
   * Generates 384-dimensional vector embeddings for a list of ChildChunks off the main UI thread.
   */
  public async generateChunkEmbeddings(
    chunks: ChildChunk[],
    onProgress?: (completed: number, total: number, percentage: number) => void
  ): Promise<ChildChunk[]> {
    await this.init();

    const activeWorker = this.worker;
    if (!activeWorker) {
      throw new Error('Worker not available');
    }

    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const handleMessage = (event: MessageEvent) => {
        const data = event.data;

        if (data.status === 'batch_progress' && onProgress) {
          onProgress(data.completed, data.total, data.percentage);
        }

        if (data.action === 'generate_embeddings' && data.id === requestId) {
          if (data.status === 'complete') {
            activeWorker.removeEventListener('message', handleMessage);
            resolve(data.chunks as ChildChunk[]);
          } else if (data.status === 'error') {
            activeWorker.removeEventListener('message', handleMessage);
            reject(new Error(data.error || 'Embedding generation failed'));
          }
        }
      };

      activeWorker.addEventListener('message', handleMessage);
      activeWorker.postMessage({
        action: 'generate_embeddings',
        id: requestId,
        chunks,
      });
    });
  }

  /**
   * Embeds a single text string (e.g. user search query).
   */
  public async embedQuery(queryText: string): Promise<number[]> {
    await this.init();

    const activeWorker = this.worker;
    if (!activeWorker) {
      throw new Error('Worker not available');
    }

    return new Promise((resolve, reject) => {
      const requestId = `req_query_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const handleMessage = (event: MessageEvent) => {
        const data = event.data;

        if (data.action === 'embed_text' && data.id === requestId) {
          if (data.status === 'complete') {
            activeWorker.removeEventListener('message', handleMessage);
            resolve(data.embedding as number[]);
          } else if (data.status === 'error') {
            activeWorker.removeEventListener('message', handleMessage);
            reject(new Error(data.error || 'Query embedding failed'));
          }
        }
      };

      activeWorker.addEventListener('message', handleMessage);
      activeWorker.postMessage({
        action: 'embed_text',
        id: requestId,
        text: queryText,
      });
    });
  }

  /**
   * Terminate worker thread.
   */
  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
      this.initPromise = null;
    }
  }
}
