/**
 * Local Document State Store (localDocumentStore.ts)
 * Manages pure browser-native PDF documents, page layout coordinates,
 * parent-child metadata chunks, and audit results in RAM and localStorage.
 */

import { PageLayout, LineLayout } from './pdfParser';
import { ChunkedDocument, ParentChunk, ChildChunk } from './browserChunker';
import { AuditResult, Annotation } from './types';

export interface LocalDocumentState {
  fileName: string;
  pages: PageLayout[];
  chunkedDocument: ChunkedDocument;
  fullText: string;
  auditResult: AuditResult | null;
  timestamp: number;
}

// In-memory cache for Object URLs and Blob references during session
const memoryBlobStore = new Map<string, { blob: Blob; objectUrl: string }>();
const memoryDocStore = new Map<string, LocalDocumentState>();

const LOCAL_DOC_LIST_KEY = 'ls_local_doc_names';
const LOCAL_DOC_PREFIX = 'ls_local_doc_';

/**
 * Saves a parsed PDF document into RAM and window.localStorage.
 */
export function saveLocalDocument(
  fileName: string,
  fileBlob: Blob,
  pages: PageLayout[],
  chunkedDocument: ChunkedDocument,
  auditResult: AuditResult | null = null
): LocalDocumentState {
  const fullText = pages.map((p) => p.fullText).join('\n\n');
  const objectUrl = URL.createObjectURL(fileBlob);

  memoryBlobStore.set(fileName, { blob: fileBlob, objectUrl });

  const docState: LocalDocumentState = {
    fileName,
    pages,
    chunkedDocument,
    fullText,
    auditResult,
    timestamp: Date.now(),
  };

  memoryDocStore.set(fileName, docState);

  // Sync metadata to localStorage (excluding binary blob)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`${LOCAL_DOC_PREFIX}${fileName}`, JSON.stringify(docState));
      const existingNames = getStoredDocumentNames();
      if (!existingNames.includes(fileName)) {
        existingNames.unshift(fileName);
        window.localStorage.setItem(LOCAL_DOC_LIST_KEY, JSON.stringify(existingNames));
      }
    } catch (err) {
      console.warn('Failed to sync document metadata to localStorage:', err);
    }
  }

  return docState;
}

/**
 * Retrieves a document state from RAM or localStorage.
 */
export function getLocalDocument(fileName: string): LocalDocumentState | null {
  if (memoryDocStore.has(fileName)) {
    return memoryDocStore.get(fileName)!;
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(`${LOCAL_DOC_PREFIX}${fileName}`);
      if (raw) {
        const parsed: LocalDocumentState = JSON.parse(raw);
        memoryDocStore.set(fileName, parsed);
        return parsed;
      }
    } catch (err) {
      console.warn('Failed to load document from localStorage:', err);
    }
  }

  return null;
}

/**
 * Retrieves the Blob object URL for rendering in PDF viewer (react-pdf).
 */
export function getLocalDocumentPdfUrl(fileName: string): string | null {
  if (memoryBlobStore.has(fileName)) {
    return memoryBlobStore.get(fileName)!.objectUrl;
  }
  return null;
}

/**
 * Registers an existing Object URL or Blob for a file name.
 */
export function registerLocalPdfBlob(fileName: string, blob: Blob): string {
  if (memoryBlobStore.has(fileName)) {
    return memoryBlobStore.get(fileName)!.objectUrl;
  }
  const objectUrl = URL.createObjectURL(blob);
  memoryBlobStore.set(fileName, { blob, objectUrl });
  return objectUrl;
}

/**
 * Returns all stored local document filenames.
 */
export function getStoredDocumentNames(): string[] {
  const memoryNames = Array.from(memoryDocStore.keys());
  if (typeof window === 'undefined') return memoryNames;

  try {
    const raw = window.localStorage.getItem(LOCAL_DOC_LIST_KEY);
    if (raw) {
      const list: string[] = JSON.parse(raw);
      const combined = Array.from(new Set([...memoryNames, ...list]));
      return combined;
    }
  } catch (err) {
    console.warn('Failed to fetch local document list:', err);
  }

  return memoryNames;
}

/**
 * Updates the audit result for a local document.
 */
export function setLocalAuditResult(fileName: string, auditResult: AuditResult): void {
  const doc = getLocalDocument(fileName);
  if (doc) {
    doc.auditResult = auditResult;
    memoryDocStore.set(fileName, doc);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(`${LOCAL_DOC_PREFIX}${fileName}`, JSON.stringify(doc));
      } catch (err) {
        console.warn('Failed to save audit result to localStorage:', err);
      }
    }
  }
}

/**
 * Searches line layout bounding boxes locally for an evidence quote.
 * Converts PDF point coordinates (72 DPI) to normalized inch dimensions.
 */
export function locateSnippetLocally(fileName: string, snippet: string): Annotation | null {
  const doc = getLocalDocument(fileName);
  if (!doc || !snippet || snippet.trim().length === 0) return null;

  const cleanSnippet = snippet.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (cleanSnippet.length < 3) return null;

  const POINTS_PER_INCH = 72.0;

  for (const page of doc.pages) {
    const matchingLines: typeof page.lines = [];
    const snippetHead = cleanSnippet.slice(0, Math.min(20, cleanSnippet.length));

    for (const line of page.lines) {
      const cleanLine = line.text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (!cleanLine) continue;

      if (cleanLine.includes(snippetHead) || cleanSnippet.includes(cleanLine.slice(0, Math.min(20, cleanLine.length)))) {
        matchingLines.push(line);
      }
    }

    if (matchingLines.length > 0) {
      const minX = Math.min(...matchingLines.map(l => l.x));
      const minY = Math.min(...matchingLines.map(l => l.y));
      const maxX = Math.max(...matchingLines.map(l => l.x + l.width));
      const maxY = Math.max(...matchingLines.map(l => l.y + l.height));

      const widthPts = Math.max(100, maxX - minX);
      const heightPts = Math.max(15, maxY - minY);

      const xInch = minX / POINTS_PER_INCH;
      const yInch = minY / POINTS_PER_INCH;
      const wInch = widthPts / POINTS_PER_INCH;
      const hInch = heightPts / POINTS_PER_INCH;

      return {
        page: page.pageNumber,
        x: Math.min(7.5, Math.max(0.4, xInch)),
        y: Math.min(10.0, Math.max(0.4, yInch)),
        width: Math.min(7.5, Math.max(1.0, wInch)),
        height: Math.min(3.0, Math.max(0.25, hInch)),
        color: 'orange',
        text: matchingLines[0].text,
      };
    }
  }

  // Fallback to searching page fullText
  for (const page of doc.pages) {
    const cleanFullText = page.fullText.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const snippetHead = cleanSnippet.slice(0, Math.min(18, cleanSnippet.length));

    if (cleanFullText.includes(snippetHead)) {
      const lineIdx = page.lines.findIndex(l => l.text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().includes(snippetHead.slice(0, 10)));
      const matchedLine = lineIdx >= 0 ? page.lines[lineIdx] : page.lines[0];
      const yPts = matchedLine ? matchedLine.y : 108.0;

      return {
        page: page.pageNumber,
        x: 0.8,
        y: Math.min(10.0, Math.max(0.5, yPts / POINTS_PER_INCH)),
        width: 6.8,
        height: 0.4,
        color: 'orange',
        text: snippet,
      };
    }
  }

  // Ultimate fallback to page 1 top section
  if (doc.pages.length > 0) {
    return {
      page: 1,
      x: 0.8,
      y: 1.5,
      width: 6.8,
      height: 0.5,
      color: 'orange',
      text: snippet,
    };
  }

  return null;
}
