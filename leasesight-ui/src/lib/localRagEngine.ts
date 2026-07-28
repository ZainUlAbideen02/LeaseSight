/**
 * In-Browser Hybrid RAG Engine (localRagEngine.ts)
 * Integrates 384-dim Dense Cosine Similarity and MiniSearch Sparse BM25 Keyword Search
 * with Min-Max Score Normalization, Blended Scoring (0.7*Dense + 0.3*BM25), and Parent Context Expansion.
 */

import MiniSearch from 'minisearch';
import { ParentChunk, ChildChunk } from './browserChunker';

export const CONTEXT_CHAR_LIMIT = 15000;

export interface HybridSearchResult {
  chunk: ChildChunk;
  denseScore: number;
  bm25Score: number;
  hybridScore: number;
}

export interface ExpandedContextResult {
  contextText: string;
  matchedChildren: ChildChunk[];
  parentPages: ParentChunk[];
  searchScores: HybridSearchResult[];
}

/**
 * Calculates cosine similarity between two vector arrays.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * In-Browser Hybrid RAG Engine managing child chunks and parent page context.
 */
export class LocalRagEngine {
  private parentMap = new Map<string, ParentChunk>();
  private childMap = new Map<string, ChildChunk>();
  private miniSearch: MiniSearch<ChildChunk>;

  constructor() {
    this.miniSearch = new MiniSearch<ChildChunk>({
      fields: ['text'],
      storeFields: ['id', 'parentId', 'fileName', 'pageNumber', 'childIndex', 'text', 'parentText'],
      searchOptions: {
        boost: { text: 1.5 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  }

  /**
   * Indexes parent pages and embedded child chunks into the local RAG engine.
   */
  public indexDocument(parents: ParentChunk[], children: ChildChunk[]): void {
    // Clear existing indexes
    this.parentMap.clear();
    this.childMap.clear();
    this.miniSearch.removeAll();

    // Store parents
    parents.forEach((parent) => {
      this.parentMap.set(parent.id, parent);
    });

    // Store and index child chunks
    const validChildren: ChildChunk[] = [];
    children.forEach((child) => {
      this.childMap.set(child.id, child);
      validChildren.push(child);
    });

    if (validChildren.length > 0) {
      this.miniSearch.addAll(validChildren);
    }
  }

  /**
   * Performs hybrid search combining 384-dim Dense Cosine Similarity and MiniSearch BM25 keyword search.
   * Applies Min-Max score normalization and paper score blending:
   * S_hybrid = 0.7 * S_dense_norm + 0.3 * S_BM25_norm
   */
  public search(
    queryVector: number[],
    queryText: string,
    topK: number = 7
  ): HybridSearchResult[] {
    const allChildren = Array.from(this.childMap.values());
    if (allChildren.length === 0) return [];

    // 1. Calculate Dense Cosine Similarity for all child chunks
    const denseMap = new Map<string, number>();
    let minDense = Infinity;
    let maxDense = -Infinity;

    allChildren.forEach((child) => {
      const score = child.embedding ? cosineSimilarity(queryVector, child.embedding) : 0;
      denseMap.set(child.id, score);
      if (score < minDense) minDense = score;
      if (score > maxDense) maxDense = score;
    });

    if (minDense === Infinity) minDense = 0;
    if (maxDense === -Infinity) maxDense = 0;

    // 2. Perform MiniSearch BM25 Sparse Search
    const bm25Map = new Map<string, number>();
    let maxBM25 = 0;

    if (queryText.trim().length > 0) {
      const bm25Results = this.miniSearch.search(queryText);
      bm25Results.forEach((res) => {
        bm25Map.set(res.id, res.score);
        if (res.score > maxBM25) maxBM25 = res.score;
      });
    }

    // 3. Apply Min-Max Score Normalization & Blended Hybrid Score Calculation
    const eps = 1e-6;
    const denseRange = maxDense - minDense;

    const hybridResults: HybridSearchResult[] = allChildren.map((child) => {
      const rawDense = denseMap.get(child.id) || 0;
      const rawBM25 = bm25Map.get(child.id) || 0;

      // Normalized Dense Score
      const denseNorm = denseRange > eps ? (rawDense - minDense) / (denseRange + eps) : rawDense > 0 ? 1.0 : 0.0;

      // Normalized BM25 Score
      const bm25Norm = maxBM25 > eps ? rawBM25 / (maxBM25 + eps) : 0.0;

      // Blended Hybrid Score
      const hybridScore = 0.7 * denseNorm + 0.3 * bm25Norm;

      return {
        chunk: child,
        denseScore: Math.round(rawDense * 10000) / 10000,
        bm25Score: Math.round(rawBM25 * 10000) / 10000,
        hybridScore: Math.round(hybridScore * 10000) / 10000,
      };
    });

    // 4. Sort descending by hybridScore and take topK
    hybridResults.sort((a, b) => b.hybridScore - a.hybridScore);
    return hybridResults.slice(0, topK);
  }

  /**
   * Retrieves top-K child chunks, expands to unique parent pages, deduplicates while
   * preserving ranking order, and bounds output context text to CONTEXT_CHAR_LIMIT (15,000 chars).
   */
  public retrieveExpandedContext(
    queryVector: number[],
    queryText: string,
    topK: number = 7
  ): ExpandedContextResult {
    const searchScores = this.search(queryVector, queryText, topK);
    const matchedChildren = searchScores.map((s) => s.chunk);

    // Map retrieved child chunks to unique parent pages preserving ranking order
    const seenParentIds = new Set<string>();
    const parentPages: ParentChunk[] = [];
    const contextBlocks: string[] = [];
    let currentLength = 0;

    for (const child of matchedChildren) {
      if (!seenParentIds.has(child.parentId)) {
        seenParentIds.add(child.parentId);
        const parent = this.parentMap.get(child.parentId);
        if (parent) {
          parentPages.push(parent);
          const block = `[Page ${parent.pageNumber} (${parent.fileName})]\n${parent.text}`;
          
          if (currentLength + block.length <= CONTEXT_CHAR_LIMIT) {
            contextBlocks.push(block);
            currentLength += block.length;
          } else {
            // Include truncated slice if limit reached
            const remaining = CONTEXT_CHAR_LIMIT - currentLength;
            if (remaining > 200) {
              contextBlocks.push(block.slice(0, remaining));
              currentLength += remaining;
            }
            break;
          }
        }
      }
    }

    // Fallback if no parent objects found (use child text directly)
    if (contextBlocks.length === 0 && matchedChildren.length > 0) {
      matchedChildren.forEach((child) => {
        const block = child.parentText || child.text;
        if (currentLength + block.length <= CONTEXT_CHAR_LIMIT) {
          contextBlocks.push(block);
          currentLength += block.length;
        }
      });
    }

    const contextText = contextBlocks.join('\n\n---\n\n');

    return {
      contextText,
      matchedChildren,
      parentPages,
      searchScores,
    };
  }

  /**
   * Returns indexed parent page count.
   */
  public getParentCount(): number {
    return this.parentMap.size;
  }

  /**
   * Returns indexed child chunk count.
   */
  public getChildCount(): number {
    return this.childMap.size;
  }
}
