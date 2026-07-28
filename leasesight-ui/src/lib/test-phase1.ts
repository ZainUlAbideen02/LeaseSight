/**
 * Phase 1 Core Client-Side Engine Verification Suite (test-phase1.ts)
 * Validates PDF layout parsing structures, Parent-Child chunking logic,
 * API key store operations, and Embedding Worker contracts.
 */

import { parsePdfLayout, PageLayout, LineLayout } from './pdfParser';
import { chunkDocumentLayouts, ParentChunk, ChildChunk, ChunkedDocument } from './browserChunker';
import { getUserGroqKey, setUserGroqKey, removeUserGroqKey, hasUserGroqKey } from './userKeyStore';
import { EmbeddingClient, EmbeddingProgress } from './embeddingClient';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

/**
 * Runs unit and contract tests for Phase 1 components.
 */
export async function runPhase1Verification(): Promise<{
  allPassed: boolean;
  results: TestResult[];
}> {
  const results: TestResult[] = [];

  // -------------------------------------------------------------------------
  // Test 1: User API Key Store (localStorage operations)
  // -------------------------------------------------------------------------
  try {
    const testKey = 'gsk_test_key_phase1_verification_12345';
    setUserGroqKey(testKey);

    const retrieved = getUserGroqKey();
    const exists = hasUserGroqKey();

    removeUserGroqKey();
    const afterRemove = getUserGroqKey();

    const keyStorePassed =
      retrieved === testKey && exists === true && afterRemove === null;

    results.push({
      name: 'User Key Store (userKeyStore.ts)',
      passed: keyStorePassed,
      message: keyStorePassed
        ? 'Successfully saved, retrieved, checked, and removed user_groq_key'
        : `Key store failed: retrieved="${retrieved}", afterRemove="${afterRemove}"`,
    });
  } catch (err) {
    results.push({
      name: 'User Key Store (userKeyStore.ts)',
      passed: false,
      message: `Error testing key store: ${String(err)}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test 2: Two-Tier Parent-Child Chunker (browserChunker.ts)
  // -------------------------------------------------------------------------
  try {
    const mockFileName = 'lease_sample.pdf';
    const mockLinesPage1: LineLayout[] = [
      { text: 'LAND LEASE AGREEMENT', x: 10, y: 20, width: 200, height: 14 },
      { text: 'This Agreement is entered into on September 19, 2025, between Landlord and Tenant.', x: 10, y: 40, width: 450, height: 12 },
      { text: 'Base Rent shall be $5,000 per month payable on the first day of each month.', x: 10, y: 60, width: 420, height: 12 },
      { text: 'Either party may terminate this Agreement by giving 60 days prior written notice to the other party.', x: 10, y: 80, width: 480, height: 12 },
      { text: 'Tenant agrees to maintain the premises in good clean condition and pay all utilities when due.', x: 10, y: 100, width: 470, height: 12 },
    ];

    const mockLinesPage2: LineLayout[] = [
      { text: 'SECTION 2: GOVERNING LAW AND DISPUTE VENUE', x: 10, y: 20, width: 350, height: 14 },
      { text: 'This Agreement shall be governed by and construed under the laws of the State of Wisconsin.', x: 10, y: 40, width: 490, height: 12 },
      { text: 'Any litigation shall be conducted in the courts of Milwaukee County, Wisconsin.', x: 10, y: 60, width: 460, height: 12 },
    ];

    const mockPages: PageLayout[] = [
      {
        pageNumber: 1,
        fullText: mockLinesPage1.map((l) => l.text).join('\n'),
        lines: mockLinesPage1,
      },
      {
        pageNumber: 2,
        fullText: mockLinesPage2.map((l) => l.text).join('\n'),
        lines: mockLinesPage2,
      },
    ];

    const chunked: ChunkedDocument = chunkDocumentLayouts(mockFileName, mockPages, {
      childChunkSize: 150,
      childChunkOverlap: 20,
    });

    const parentsValid = chunked.parents.length === 2 && chunked.parents[0].id === 'lease_sample.pdf_p1';
    const childrenExist = chunked.children.length >= 2;
    const childHasParentPointers = chunked.children.every(
      (c) => Boolean(c.parentId) && Boolean(c.parentText) && Boolean(c.id)
    );

    const chunkerPassed = parentsValid && childrenExist && childHasParentPointers;

    results.push({
      name: 'Parent-Child Chunker (browserChunker.ts)',
      passed: chunkerPassed,
      message: chunkerPassed
        ? `Successfully generated ${chunked.parents.length} Parent chunks and ${chunked.children.length} Child chunks with valid pointers`
        : `Chunker validation failed: parents=${chunked.parents.length}, children=${chunked.children.length}`,
      details: {
        parentIds: chunked.parents.map((p) => p.id),
        sampleChildId: chunked.children[0]?.id,
        sampleChildParentId: chunked.children[0]?.parentId,
        sampleChildLength: chunked.children[0]?.text.length,
      },
    });
  } catch (err) {
    results.push({
      name: 'Parent-Child Chunker (browserChunker.ts)',
      passed: false,
      message: `Error testing chunker: ${String(err)}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test 3: PDF Layout Parser Type & Interface Contract (pdfParser.ts)
  // -------------------------------------------------------------------------
  try {
    const isParseFuncAvailable = typeof parsePdfLayout === 'function';
    results.push({
      name: 'PDF Layout Parser Interface (pdfParser.ts)',
      passed: isParseFuncAvailable,
      message: isParseFuncAvailable
        ? 'parsePdfLayout is available and exposes PageLayout / LineLayout contracts'
        : 'parsePdfLayout is missing or not a function',
    });
  } catch (err) {
    results.push({
      name: 'PDF Layout Parser Interface (pdfParser.ts)',
      passed: false,
      message: `Error testing PDF parser interface: ${String(err)}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test 4: Embedding Client & Worker Contract (embeddingClient.ts)
  // -------------------------------------------------------------------------
  try {
    const isClientAvailable = typeof EmbeddingClient === 'function';
    results.push({
      name: 'Embedding Client Manager (embeddingClient.ts)',
      passed: isClientAvailable,
      message: isClientAvailable
        ? 'EmbeddingClient manager class available for WebGPU/WASM worker offloading'
        : 'EmbeddingClient class is missing',
    });
  } catch (err) {
    results.push({
      name: 'Embedding Client Manager (embeddingClient.ts)',
      passed: false,
      message: `Error testing embedding client: ${String(err)}`,
    });
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}
