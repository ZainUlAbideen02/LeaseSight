/**
 * Phase 2 Integration & Verification Suite (test-phase2.ts)
 * Validates Dense Cosine Similarity, MiniSearch Sparse BM25, Min-Max Normalization,
 * Hybrid Blended Score Formula (0.7*Dense + 0.3*BM25), Parent Context Expansion,
 * Groundedness Quote Matching, and Deterministic Fallback Regex Parsing.
 */

import { LocalRagEngine, cosineSimilarity, CONTEXT_CHAR_LIMIT } from './localRagEngine';
import { fallbackAudit, verifyQuoteGrounded, AuditResult } from './clientAuditEngine';
import { ParentChunk, ChildChunk } from './browserChunker';

export interface TestResultPhase2 {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

export async function runPhase2Verification(): Promise<{
  allPassed: boolean;
  results: TestResultPhase2[];
}> {
  const results: TestResultPhase2[] = [];

  // -------------------------------------------------------------------------
  // Test 1: Cosine Similarity Math
  // -------------------------------------------------------------------------
  try {
    const vecA = [1.0, 0.0, 0.0, 0.5];
    const vecB = [1.0, 0.0, 0.0, 0.5];
    const vecC = [0.0, 1.0, 0.0, 0.0];

    const simSelf = cosineSimilarity(vecA, vecB);
    const simOrthogonal = cosineSimilarity(vecA, vecC);

    const mathPassed = Math.abs(simSelf - 1.0) < 1e-4 && Math.abs(simOrthogonal - 0.0) < 1e-4;

    results.push({
      name: 'Cosine Similarity Math',
      passed: mathPassed,
      message: mathPassed
        ? `Identical vectors similarity = ${simSelf.toFixed(4)}, Orthogonal = ${simOrthogonal.toFixed(4)}`
        : `Cosine similarity failed: self=${simSelf}, orth=${simOrthogonal}`,
    });
  } catch (err) {
    results.push({
      name: 'Cosine Similarity Math',
      passed: false,
      message: `Error: ${String(err)}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test 2: In-Browser Hybrid RAG Search Engine (Dense + BM25 Blending)
  // -------------------------------------------------------------------------
  try {
    const engine = new LocalRagEngine();

    const parents: ParentChunk[] = [
      {
        id: 'office_lease.pdf_p1',
        fileName: 'office_lease.pdf',
        pageNumber: 1,
        text: 'LAND LEASE AGREEMENT. Lessors: Mr. James A. Monthly Rent: $5,000. Commencement Date: September 19, 2025.',
        lines: [],
      },
      {
        id: 'office_lease.pdf_p2',
        fileName: 'office_lease.pdf',
        pageNumber: 2,
        text: 'TERMINATION AND NOTICE. Either party may terminate this Agreement by giving 60 days prior written notice. Governing Law: State of Wisconsin.',
        lines: [],
      },
    ];

    // Dummy 384-dim embeddings
    const dummyEmb1 = new Array(384).fill(0.1);
    dummyEmb1[0] = 0.9;
    const dummyEmb2 = new Array(384).fill(0.1);
    dummyEmb2[1] = 0.9;

    const children: ChildChunk[] = [
      {
        id: 'office_lease.pdf_p1_c0',
        parentId: 'office_lease.pdf_p1',
        fileName: 'office_lease.pdf',
        pageNumber: 1,
        childIndex: 0,
        text: 'Monthly Rent: $5,000. Commencement Date: September 19, 2025.',
        parentText: parents[0].text,
        embedding: dummyEmb1,
      },
      {
        id: 'office_lease.pdf_p2_c0',
        parentId: 'office_lease.pdf_p2',
        fileName: 'office_lease.pdf',
        pageNumber: 2,
        childIndex: 0,
        text: 'Either party may terminate this Agreement by giving 60 days prior written notice.',
        parentText: parents[1].text,
        embedding: dummyEmb2,
      },
    ];

    engine.indexDocument(parents, children);

    const queryVec = new Array(384).fill(0.1);
    queryVec[0] = 0.85; // Close to child 0

    const searchRes = engine.search(queryVec, 'terminate written notice', 2);
    const hybridPassed =
      searchRes.length === 2 &&
      typeof searchRes[0].hybridScore === 'number' &&
      searchRes[0].hybridScore >= searchRes[1].hybridScore;

    results.push({
      name: 'Hybrid Search Engine (0.7*Dense + 0.3*BM25)',
      passed: hybridPassed,
      message: hybridPassed
        ? `Hybrid search executed cleanly. Top match ID=${searchRes[0].chunk.id}, HybridScore=${searchRes[0].hybridScore}`
        : 'Hybrid search scoring or sorting failed',
      details: {
        topMatchId: searchRes[0]?.chunk.id,
        denseScore: searchRes[0]?.denseScore,
        bm25Score: searchRes[0]?.bm25Score,
        hybridScore: searchRes[0]?.hybridScore,
      },
    });

    // -----------------------------------------------------------------------
    // Test 3: Parent Context Expansion & Bounding
    // -----------------------------------------------------------------------
    const expanded = engine.retrieveExpandedContext(queryVec, 'terminate notice', 2);
    const expansionPassed =
      expanded.parentPages.length >= 1 &&
      expanded.contextText.includes('Page 1') &&
      expanded.contextText.length <= CONTEXT_CHAR_LIMIT;

    results.push({
      name: 'Parent Context Expansion',
      passed: expansionPassed,
      message: expansionPassed
        ? `Retrieved ${expanded.parentPages.length} unique parent pages (${expanded.contextText.length} chars)`
        : 'Parent context expansion failed',
    });
  } catch (err) {
    results.push({
      name: 'Hybrid RAG & Context Expansion',
      passed: false,
      message: `Error: ${String(err)}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test 4: Groundedness Quote Verification
  // -------------------------------------------------------------------------
  try {
    const docText = 'Landlord agrees to lease property located at 100 Main St to Tenant for $2,500 monthly.';
    const validQuote = 'lease property located at 100 Main St';
    const invalidQuote = 'Rent shall be $10,000 payable annually';

    const isGrounded1 = verifyQuoteGrounded(validQuote, docText);
    const isGrounded2 = verifyQuoteGrounded(invalidQuote, docText);

    const groundedPassed = isGrounded1 === true && isGrounded2 === false;

    results.push({
      name: 'Quote Groundedness Verification',
      passed: groundedPassed,
      message: groundedPassed
        ? 'Correctly verified valid evidence quote and flagged hallucinated quote'
        : `Groundedness check failed: validQuote=${isGrounded1}, invalidQuote=${isGrounded2}`,
    });
  } catch (err) {
    results.push({
      name: 'Quote Groundedness Verification',
      passed: false,
      message: `Error: ${String(err)}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test 5: Deterministic Fallback Audit Engine
  // -------------------------------------------------------------------------
  try {
    const sampleLease = `
      COMMERCIAL LEASE AGREEMENT
      Lessor: ACME Holdings Inc.
      Lessee: Nexus Tech Ltd.
      Monthly Rent: $4,500 USD
      Security Deposit: $9,000 USD
      Commencement Date: October 1, 2025
      Either party may terminate by giving 60 days written notice.
      Governing Law: State of New York.
    `;

    const audit: AuditResult = fallbackAudit(sampleLease, 'sample_lease.pdf');

    const fallbackPassed =
      audit.lease_metadata.lessor === 'ACME Holdings Inc.' &&
      audit.lease_metadata.lessee === 'Nexus Tech Ltd.' &&
      audit.findings.some((f) => f.label === 'Rent') &&
      audit.findings.some((f) => f.label === 'Termination Notice');

    results.push({
      name: 'Deterministic Fallback Audit Parser',
      passed: fallbackPassed,
      message: fallbackPassed
        ? `Successfully extracted Lessor (${audit.lease_metadata.lessor}), Lessee (${audit.lease_metadata.lessee}), and ${audit.findings.length} findings`
        : `Fallback audit failed: lessor=${audit.lease_metadata.lessor}, findings=${audit.findings.length}`,
      details: {
        lessor: audit.lease_metadata.lessor,
        lessee: audit.lease_metadata.lessee,
        findingsCount: audit.findings.length,
      },
    });
  } catch (err) {
    results.push({
      name: 'Deterministic Fallback Audit Parser',
      passed: false,
      message: `Error: ${String(err)}`,
    });
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}
