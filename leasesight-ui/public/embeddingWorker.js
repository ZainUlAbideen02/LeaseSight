/**
 * WebGPU / WASM Embedding Web Worker (public/embeddingWorker.js)
 * Offloads quantized Xenova/bge-small-en-v1.5 embedding generation off the UI thread.
 * Device preference: WebGPU with automatic WASM fallback.
 */

import { pipeline, env } from '@xenova/transformers';

// Enable browser cache for HuggingFace model weights
env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_NAME = 'Xenova/bge-small-en-v1.5';
let extractor = null;

/**
 * Lazy loads the feature extraction pipeline.
 * Tries WebGPU first, fallback to WASM on error.
 */
async function loadPipeline(progressCallback) {
  if (extractor) return extractor;

  try {
    self.postMessage({ status: 'loading', device: 'webgpu', message: 'Initializing WebGPU model...' });
    extractor = await pipeline('feature-extraction', MODEL_NAME, {
      device: 'webgpu',
      progress_callback: progressCallback,
    });
    self.postMessage({ status: 'ready', device: 'webgpu' });
  } catch (webgpuErr) {
    console.warn('[EmbeddingWorker] WebGPU not supported/failed, falling back to WASM:', webgpuErr);
    self.postMessage({ status: 'loading', device: 'wasm', message: 'Falling back to WASM model...' });

    extractor = await pipeline('feature-extraction', MODEL_NAME, {
      device: 'wasm',
      progress_callback: progressCallback,
    });
    self.postMessage({ status: 'ready', device: 'wasm' });
  }

  return extractor;
}

/**
 * Message handler for worker calls.
 */
self.addEventListener('message', async (event) => {
  const { action, chunks, id, text } = event.data || {};

  if (action === 'init') {
    try {
      await loadPipeline((progress) => {
        self.postMessage({ status: 'progress', progress });
      });
    } catch (err) {
      self.postMessage({ status: 'error', error: String(err) });
    }
    return;
  }

  if (action === 'generate_embeddings') {
    try {
      const pipe = await loadPipeline((progress) => {
        self.postMessage({ status: 'progress', progress });
      });

      const inputChunks = Array.isArray(chunks) ? chunks : [];
      const total = inputChunks.length;
      const embeddedChunks = [];

      for (let i = 0; i < total; i++) {
        const chunk = inputChunks[i];
        const textToEmbed = chunk.text || '';

        // Generate mean-pooled, L2-normalized 384-dim vector
        const output = await pipe(textToEmbed, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data);

        embeddedChunks.push({
          ...chunk,
          embedding,
        });

        // Emit batch progress
        if ((i + 1) % 5 === 0 || i === total - 1) {
          self.postMessage({
            status: 'batch_progress',
            completed: i + 1,
            total,
            percentage: Math.round(((i + 1) / total) * 100),
          });
        }
      }

      self.postMessage({
        status: 'complete',
        action: 'generate_embeddings',
        id,
        chunks: embeddedChunks,
      });
    } catch (err) {
      self.postMessage({ status: 'error', action: 'generate_embeddings', id, error: String(err) });
    }
    return;
  }

  if (action === 'embed_text') {
    try {
      const pipe = await loadPipeline();
      const output = await pipe(text || '', { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);

      self.postMessage({
        status: 'complete',
        action: 'embed_text',
        id,
        embedding,
      });
    } catch (err) {
      self.postMessage({ status: 'error', action: 'embed_text', id, error: String(err) });
    }
    return;
  }
});
