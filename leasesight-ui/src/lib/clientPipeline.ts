/**
 * Client-Side RAG Pipeline Orchestrator (clientPipeline.ts)
 * Orchestrates PDF Layout Parsing, Parent-Child Chunking, WebGPU Vector Embeddings,
 * Local RAG Indexing, Audit Reasoning, and Evidence Quote Coordinate Bounding.
 */

import { parsePdfLayout, PageLayout, LineLayout } from './pdfParser';
import { chunkDocumentLayouts, ChunkedDocument, ChildChunk, ParentChunk } from './browserChunker';
import { EmbeddingClient } from './embeddingClient';
import { LocalRagEngine, ExpandedContextResult } from './localRagEngine';
import { runClientAudit, AuditResult } from './clientAuditEngine';

export interface ClientPipelineResult {
  fileName: string;
  pages: PageLayout[];
  chunkedDocument: ChunkedDocument;
  ragEngine: LocalRagEngine;
  auditResult?: AuditResult;
  expandedContext?: ExpandedContextResult;
}

export interface CoordinateHighlight {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  matchedText: string;
}

/**
 * Ingests a PDF File entirely on the client:
 * 1. Reads File ArrayBuffer
 * 2. Parses page layouts and line bounding boxes via pdfjs-dist
 * 3. Creates Parent-Child document chunks
 * 4. Offloads 384-dim vector embeddings generation to Web Worker (WebGPU/WASM)
 * 5. Indexes into LocalRagEngine
 */
export async function ingestPdfClient(
  file: File,
  embeddingClient: EmbeddingClient,
  onProgress?: (stage: string, percent: number) => void
): Promise<{
  pages: PageLayout[];
  chunkedDocument: ChunkedDocument;
  ragEngine: LocalRagEngine;
}> {
  const fileName = file.name;

  if (onProgress) onProgress('Parsing PDF Layout & Coordinates', 10);
  const arrayBuffer = await file.arrayBuffer();
  const pages = await parsePdfLayout(arrayBuffer);

  if (onProgress) onProgress('Generating Parent & Child Chunks', 30);
  const chunkedDocument = chunkDocumentLayouts(fileName, pages, {
    childChunkSize: 250,
    childChunkOverlap: 40,
  });

  if (onProgress) onProgress('Offloading WebGPU Vector Embeddings', 50);
  const embeddedChildren = await embeddingClient.generateChunkEmbeddings(
    chunkedDocument.children,
    (completed, total, percentage) => {
      if (onProgress) {
        onProgress(`Embedding Chunks (${completed}/${total})`, 50 + Math.round(percentage * 0.4));
      }
    }
  );

  chunkedDocument.children = embeddedChildren;

  if (onProgress) onProgress('Indexing Local RAG Engine', 95);
  const ragEngine = new LocalRagEngine();
  ragEngine.indexDocument(chunkedDocument.parents, embeddedChildren);

  if (onProgress) onProgress('Ingestion Complete', 100);

  return {
    pages,
    chunkedDocument,
    ragEngine,
  };
}

/**
 * Executes full client-side compliance audit:
 * 1. Embeds audit query via Web Worker
 * 2. Performs Hybrid RAG Search (0.7*Dense + 0.3*BM25)
 * 3. Expands matching child chunks back to unique parent pages
 * 4. Calls runClientAudit (Groq browser LLM or fallback regex engine)
 */
export async function executeClientAudit(
  fileName: string,
  ragEngine: LocalRagEngine,
  embeddingClient: EmbeddingClient,
  queryText: string = 'Lease compliance audit summary, critical clauses, obligations, risk warnings'
): Promise<{
  auditResult: AuditResult;
  expandedContext: ExpandedContextResult;
}> {
  const queryVector = await embeddingClient.embedQuery(queryText);
  const expandedContext = ragEngine.retrieveExpandedContext(queryVector, queryText, 7);

  const auditResult = await runClientAudit(fileName, expandedContext.contextText);

  return {
    auditResult,
    expandedContext,
  };
}

/**
 * Locates line layout coordinates for an evidence quote to render bounding highlights on PDF canvas.
 */
export function findQuoteBoundingBox(
  evidenceQuote: string,
  pages: PageLayout[],
  targetPageNumber?: number
): CoordinateHighlight | null {
  if (!evidenceQuote || evidenceQuote === 'Not Found' || evidenceQuote.trim().length === 0) {
    return null;
  }

  const cleanQuote = evidenceQuote.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (cleanQuote.length < 5) return null;

  const pagesToSearch = targetPageNumber
    ? pages.filter((p) => p.pageNumber === targetPageNumber)
    : pages;

  for (const page of pagesToSearch) {
    // Search line items on this page
    for (const line of page.lines) {
      const cleanLineText = line.text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (cleanLineText.includes(cleanQuote.slice(0, 20)) || cleanQuote.includes(cleanLineText.slice(0, 20))) {
        return {
          pageNumber: page.pageNumber,
          x: line.x,
          y: line.y,
          width: line.width,
          height: line.height,
          matchedText: line.text,
        };
      }
    }
  }

  // Fallback: return default bounding box on first matching page if line exact match misses
  for (const page of pagesToSearch) {
    const cleanFull = page.fullText.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (cleanFull.includes(cleanQuote.slice(0, 20))) {
      const firstLine = page.lines[0] || { x: 50, y: 100, width: 300, height: 20 };
      return {
        pageNumber: page.pageNumber,
        x: firstLine.x,
        y: firstLine.y,
        width: firstLine.width,
        height: firstLine.height,
        matchedText: evidenceQuote,
      };
    }
  }

  return null;
}
