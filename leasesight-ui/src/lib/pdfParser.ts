/**
 * Client-Side PDF Layout Parser (pdfParser.ts)
 * Extracts page-level text and line-by-line bounding boxes in Web coordinate space using pdfjs-dist.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Ensure PDF.js worker is properly configured for browser runtime
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export interface LineLayout {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageLayout {
  pageNumber: number;
  fullText: string;
  lines: LineLayout[];
}

interface PDFTextItem {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[]; // [scaleX, skewX, skewY, scaleY, tx, ty]
  fontName: string;
  hasEOL?: boolean;
}

/**
 * Parses a PDF ArrayBuffer file entirely in the browser and extracts
 * page layouts, full page text, and line-level bounding coordinates.
 */
export async function parsePdfLayout(arrayBuffer: ArrayBuffer): Promise<PageLayout[]> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdfDocument = await loadingTask.promise;
  const numPages = pdfDocument.numPages;
  const pages: PageLayout[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;

    const textContent = await page.getTextContent();
    const items = textContent.items as PDFTextItem[];

    // Extract positioned items and map PDF coords -> Web coords (top-left origin)
    const rawItems = items
      .filter((item): item is PDFTextItem => 'str' in item && item.str.trim().length > 0)
      .map((item) => {
        const transform = item.transform;
        const pdfX = transform[4];
        const pdfY = transform[5];
        const itemHeight = Math.abs(transform[3]) || item.height || 10;
        const itemWidth = item.width || 0;

        // Flip Y to Web coordinate space (0,0 at top-left)
        const webY = Math.max(0, pageHeight - pdfY - itemHeight);
        const webX = Math.max(0, pdfX);

        return {
          text: item.str,
          x: Math.round(webX * 100) / 100,
          y: Math.round(webY * 100) / 100,
          width: Math.round(itemWidth * 100) / 100,
          height: Math.round(itemHeight * 100) / 100,
        };
      });

    // Group items into lines using vertical overlap / threshold (e.g. 4px tolerance)
    const lineTolerance = 4;
    const sortedItems = [...rawItems].sort((a, b) => a.y - b.y || a.x - b.x);
    const lineGroups: typeof rawItems[] = [];

    for (const item of sortedItems) {
      let addedToLine = false;
      for (const line of lineGroups) {
        const avgY = line.reduce((sum, i) => sum + i.y, 0) / line.length;
        if (Math.abs(item.y - avgY) <= lineTolerance) {
          line.push(item);
          addedToLine = true;
          break;
        }
      }

      if (!addedToLine) {
        lineGroups.push([item]);
      }
    }

    // Sort each line horizontally and build structured LineLayout
    const lines: LineLayout[] = lineGroups
      .map((lineItems) => {
        lineItems.sort((a, b) => a.x - b.x);

        const lineText = lineItems.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim();
        const minX = Math.min(...lineItems.map((i) => i.x));
        const minY = Math.min(...lineItems.map((i) => i.y));
        const maxX = Math.max(...lineItems.map((i) => i.x + i.width));
        const maxY = Math.max(...lineItems.map((i) => i.y + i.height));

        return {
          text: lineText,
          x: Math.round(minX * 100) / 100,
          y: Math.round(minY * 100) / 100,
          width: Math.round((maxX - minX) * 100) / 100,
          height: Math.round((maxY - minY) * 100) / 100,
        };
      })
      .filter((line) => line.text.length > 0)
      .sort((a, b) => a.y - b.y);

    const fullText = lines.map((l) => l.text).join('\n');

    pages.push({
      pageNumber: pageNum,
      fullText,
      lines,
    });
  }

  return pages;
}
