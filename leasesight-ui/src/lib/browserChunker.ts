/**
 * Two-Tier Parent-Child Chunker (browserChunker.ts)
 * Implements Parent-Child chunking:
 *  - Parent Chunk: Whole page layout text with ID "${fileName}_p${pageNumber}"
 *  - Child Chunk: ~250 character sub-slices with ID "${fileName}_p${pageNumber}_c${childIndex}"
 */

import { PageLayout, LineLayout } from './pdfParser';

export interface ParentChunk {
  id: string;
  fileName: string;
  pageNumber: number;
  text: string;
  lines: LineLayout[];
}

export interface ChildChunk {
  id: string;
  parentId: string;
  fileName: string;
  pageNumber: number;
  childIndex: number;
  text: string;
  parentText: string;
  embedding?: number[];
}

export interface ChunkedDocument {
  parents: ParentChunk[];
  children: ChildChunk[];
}

export interface ChunkerOptions {
  childChunkSize?: number; // Target characters per child chunk (default: 250)
  childChunkOverlap?: number; // Overlap in characters (default: 40)
}

/**
 * Sanitize filename for use in IDs.
 */
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Splits text into ~250 character sub-slices respecting word boundaries.
 */
function splitIntoChildTexts(text: string, chunkSize: number = 250, overlap: number = 40): string[] {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!cleanText) return [];
  if (cleanText.length <= chunkSize) return [cleanText];

  const slices: string[] = [];
  let start = 0;

  while (start < cleanText.length) {
    let end = start + chunkSize;

    if (end < cleanText.length) {
      // Find space boundary near target end to avoid splitting words
      const lastSpace = cleanText.lastIndexOf(' ', end);
      if (lastSpace > start + Math.floor(chunkSize * 0.6)) {
        end = lastSpace;
      }
    } else {
      end = cleanText.length;
    }

    const chunkStr = cleanText.slice(start, end).trim();
    if (chunkStr.length > 0) {
      slices.push(chunkStr);
    }

    if (end >= cleanText.length) break;

    // Advance start with overlap, advancing at least 1 character
    start = Math.max(start + 1, end - overlap);
  }

  return slices;
}

/**
 * Converts parsed PageLayout objects into Parent and Child chunk structures.
 */
export function chunkDocumentLayouts(
  fileName: string,
  pages: PageLayout[],
  options: ChunkerOptions = {}
): ChunkedDocument {
  const chunkSize = options.childChunkSize ?? 250;
  const overlap = options.childChunkOverlap ?? 40;
  const safeFileName = sanitizeFileName(fileName);

  const parents: ParentChunk[] = [];
  const children: ChildChunk[] = [];

  for (const page of pages) {
    const parentId = `${safeFileName}_p${page.pageNumber}`;
    const parentText = page.fullText.trim();

    const parentChunk: ParentChunk = {
      id: parentId,
      fileName,
      pageNumber: page.pageNumber,
      text: parentText,
      lines: page.lines,
    };
    parents.push(parentChunk);

    // Generate ~250-char child chunks from parent text
    const childTexts = splitIntoChildTexts(parentText, chunkSize, overlap);

    childTexts.forEach((childText, childIdx) => {
      const childId = `${parentId}_c${childIdx}`;
      const childChunk: ChildChunk = {
        id: childId,
        parentId,
        fileName,
        pageNumber: page.pageNumber,
        childIndex: childIdx,
        text: childText,
        parentText,
      };
      children.push(childChunk);
    });
  }

  return { parents, children };
}
