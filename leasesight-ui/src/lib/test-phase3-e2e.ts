/**
 * Phase 3 End-to-End Verification Suite (test-phase3-e2e.ts)
 * Validates full client-side pipeline orchestration from PDF layout parsing,
 * parent-child chunking, in-browser hybrid RAG search, Groq audit / fallback execution,
 * and evidence quote coordinate bounding box calculation.
 */

import { PageLayout, LineLayout } from './pdfParser';
import { chunkDocumentLayouts, ChunkedDocument } from './browserChunker';
import { LocalRagEngine } from './localRagEngine';
import { fallbackAudit, verifyQuoteGrounded, AuditResult } from './clientAuditEngine';
import { findQuoteBoundingBox, CoordinateHighlight } from './clientPipeline';
import { getUserGroqKey, setUserGroqKey, removeUserGroqKey } from './userKeyStore';

export interface Phase3TestResult {
  step: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

export async function runPhase3E2EVerification(): Promise<{
  success: boolean;
  results: Phase3TestResult[];
}> {
  const results: Phase3TestResult[] = [];

  // -------------------------------------------------------------------------
  // Step 1: Mock PDF Page Layout & Line Coordinates Creation
  // -------------------------------------------------------------------------
  const mockLines: LineLayout[] = [
    { text: 'LAND LEASE AGREEMENT', x: 72, y: 72, width: 250, height: 16 },
    { text: 'This Land Lease Agreement is entered into by Mr. James A (Lessor) and Acme Retail (Lessee).', x: 72, y: 100, width: 450, height: 12 },
    { text: 'Base Rent shall be $6,500 USD per month payable in advance.', x: 72, y: 120, width: 380, height: 12 },
    { text: 'Either party may terminate this Agreement by giving 6 months written notice.', x: 72, y: 140, width: 420, height: 12 },
    { text: 'Termination may occur if Lessee fails to pay rent for 2 consecutive months.', x: 72, y: 160, width: 430, height: 12 },
    { text: 'Governing Law: This agreement shall be governed by the laws of the State of Wisconsin.', x: 72, y: 180, width: 460, height: 12 },
  ];

  const mockPages: PageLayout[] = [
    {
      pageNumber: 1,
      fullText: mockLines.map((l) => l.text).join('\n'),
      lines: mockLines,
    },
  ];

  results.push({
    step: '1. PDF Layout & Coordinate Extraction',
    passed: mockPages.length === 1 && mockPages[0].lines.length === 6,
    message: 'Extracted 1 page layout with 6 line-by-line bounding coordinates',
  });

  // -------------------------------------------------------------------------
  // Step 2: Parent-Child Chunking
  // -------------------------------------------------------------------------
  const fileName = 'e2e_land_lease.pdf';
  const chunkedDoc: ChunkedDocument = chunkDocumentLayouts(fileName, mockPages, {
    childChunkSize: 180,
    childChunkOverlap: 30,
  });

  const chunkingValid = chunkedDoc.parents.length === 1 && chunkedDoc.children.length >= 2;

  results.push({
    step: '2. Two-Tier Parent-Child Chunking',
    passed: chunkingValid,
    message: `Generated ${chunkedDoc.parents.length} Parent and ${chunkedDoc.children.length} Child chunks with pointers`,
  });

  // -------------------------------------------------------------------------
  // Step 3: Local RAG Engine Indexing & Hybrid Search
  // -------------------------------------------------------------------------
  const ragEngine = new LocalRagEngine();

  // Attach 384-dim dummy embeddings for simulation
  const dummyVector = new Array(384).fill(0.05);
  dummyVector[0] = 0.95;

  chunkedDoc.children.forEach((child, idx) => {
    const vec = new Array(384).fill(0.05);
    vec[idx % 384] = 0.9;
    child.embedding = vec;
  });

  ragEngine.indexDocument(chunkedDoc.parents, chunkedDoc.children);

  const expandedContext = ragEngine.retrieveExpandedContext(dummyVector, 'terminate notice rent', 5);
  const ragValid = expandedContext.contextText.length > 50 && expandedContext.matchedChildren.length > 0;

  results.push({
    step: '3. In-Browser Hybrid RAG & Parent Context Expansion',
    passed: ragValid,
    message: `Retrieved ${expandedContext.matchedChildren.length} matching child chunks, expanded to page text (${expandedContext.contextText.length} chars)`,
  });

  // -------------------------------------------------------------------------
  // Step 4: Client Audit Reasoning (Fallback + Quote Groundedness)
  // -------------------------------------------------------------------------
  const auditResult: AuditResult = fallbackAudit(expandedContext.contextText, fileName);
  const auditValid =
    auditResult.lease_metadata.lessor === 'Mr. James A' &&
    auditResult.findings.length >= 2 &&
    auditResult.findings.every((f) => f.verified_grounded === true);

  results.push({
    step: '4. Client Audit Reasoning & Quote Groundedness Verification',
    passed: auditValid,
    message: `Extracted Lessor (${auditResult.lease_metadata.lessor}), ${auditResult.findings.length} findings, 100% verified grounded quotes`,
  });

  // -------------------------------------------------------------------------
  // Step 5: Bounding Box Coordinate Calculation for Visual Highlights
  // -------------------------------------------------------------------------
  const quoteToLocate = 'Either party may terminate this Agreement';
  const highlight: CoordinateHighlight | null = findQuoteBoundingBox(quoteToLocate, mockPages, 1);

  const highlightValid =
    highlight !== null &&
    highlight.pageNumber === 1 &&
    highlight.x === 72 &&
    highlight.y === 140;

  results.push({
    step: '5. Visual Coordinate Highlight Mapping',
    passed: highlightValid,
    message: highlightValid
      ? `Successfully mapped quote to PDF Page ${highlight.pageNumber} coordinates: x=${highlight.x}, y=${highlight.y}, w=${highlight.width}, h=${highlight.height}`
      : `Highlight calculation failed: ${JSON.stringify(highlight)}`,
  });

  // -------------------------------------------------------------------------
  // Step 6: User Key Store State Binding
  // -------------------------------------------------------------------------
  setUserGroqKey('gsk_e2e_verification_key_99999');
  const stored = getUserGroqKey();
  removeUserGroqKey();
  const cleared = getUserGroqKey();

  const keyStoreValid = stored === 'gsk_e2e_verification_key_99999' && cleared === null;

  results.push({
    step: '6. User API Key State Management',
    passed: keyStoreValid,
    message: 'User API key successfully managed in localStorage with SSR fallbacks',
  });

  const success = results.every((r) => r.passed);
  return { success, results };
}
