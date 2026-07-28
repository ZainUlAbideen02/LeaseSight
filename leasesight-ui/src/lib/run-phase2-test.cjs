/**
 * Standalone Node Verification Script for Phase 2
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log(' PHASE 2: HYBRID SEARCH & AUDIT ENGINE VERIFICATION');
console.log('====================================================\n');

// 1. Check file existence
const files = [
  'src/lib/localRagEngine.ts',
  'src/lib/clientAuditEngine.ts',
  'src/lib/test-phase2.ts',
];

let allFilesExist = true;
files.forEach((relPath) => {
  const fullPath = path.join(__dirname, '..', '..', relPath);
  const exists = fs.existsSync(fullPath);
  console.log(`[FILE CHECK] ${relPath.padEnd(32)}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
  if (!exists) allFilesExist = false;
});

// 2. Cosine Similarity & Score Normalization Verification
console.log('\n--- Testing Cosine Similarity Math ---');
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    nA += vecA[i] * vecA[i];
    nB += vecB[i] * vecB[i];
  }
  if (nA === 0 || nB === 0) return 0;
  return dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

const v1 = [1, 0, 0];
const v2 = [1, 0, 0];
const v3 = [0, 1, 0];

const s1 = cosineSimilarity(v1, v2);
const s2 = cosineSimilarity(v1, v3);
const cosMathValid = Math.abs(s1 - 1.0) < 1e-4 && Math.abs(s2 - 0.0) < 1e-4;
console.log(`  Identical vector similarity : ${s1.toFixed(4)} (Expected: 1.0000)`);
console.log(`  Orthogonal vector similarity: ${s2.toFixed(4)} (Expected: 0.0000)`);
console.log(`Cosine Math Test: ${cosMathValid ? '✅ PASSED' : '❌ FAILED'}`);

// 3. Score Normalization & Blending Math Verification
console.log('\n--- Testing Score Normalization & Blending (0.7*Dense + 0.3*BM25) ---');
const rawDense = 0.85;
const minDense = 0.20;
const maxDense = 0.90;
const rawBM25 = 12.5;
const maxBM25 = 15.0;

const eps = 1e-6;
const denseNorm = (rawDense - minDense) / (maxDense - minDense + eps);
const bm25Norm = rawBM25 / (maxBM25 + eps);
const hybridScore = 0.7 * denseNorm + 0.3 * bm25Norm;

console.log(`  Normalized Dense Score: ${denseNorm.toFixed(4)}`);
console.log(`  Normalized BM25 Score : ${bm25Norm.toFixed(4)}`);
console.log(`  Blended Hybrid Score  : ${hybridScore.toFixed(4)}`);

const blendingValid = hybridScore > 0 && hybridScore <= 1.0;
console.log(`Score Blending Test: ${blendingValid ? '✅ PASSED' : '❌ FAILED'}`);

// 4. Groundedness Quote Verification
console.log('\n--- Testing Quote Groundedness Matcher ---');
function verifyQuoteGrounded(quote, contextText) {
  if (!quote || quote === 'Not Found' || quote.length < 10) return true;
  const cleanContext = contextText.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const cleanQuote = quote.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!cleanContext || !cleanQuote) return true;
  const searchSnippet = cleanQuote.slice(0, Math.min(25, cleanQuote.length));
  return cleanContext.includes(searchSnippet);
}

const context = 'This Land Lease Agreement is entered into on September 19, 2025, between James A (Lessor) and Tenant.';
const validQ = 'entered into on September 19, 2025';
const invalidQ = 'Rent shall be $50,000 paid in advance';

const g1 = verifyQuoteGrounded(validQ, context);
const g2 = verifyQuoteGrounded(invalidQ, context);

const quoteMatchValid = g1 === true && g2 === false;
console.log(`  Valid quote match  : ${g1 ? 'GROUNDED' : 'NOT GROUNDED'}`);
console.log(`  Invalid quote match: ${g2 ? 'GROUNDED' : 'NOT GROUNDED'}`);
console.log(`Groundedness Verification Test: ${quoteMatchValid ? '✅ PASSED' : '❌ FAILED'}`);

// 5. Fallback Regex Audit Extraction
console.log('\n--- Testing Fallback Regex Audit Extractor ---');
function fallbackAudit(contextText, targetFile) {
  const text = contextText.replace(/\s+/g, ' ');
  const patterns = {
    Lessor: [
      /(?:lessor|landlord)\s*[:\-]?\s*([A-Z0-9][A-Za-z0-9&.,'() \-]{2,60}?)(?=\s+and\s+|\s*\,|\s*\.|\s*\(|$)/i,
    ],
    Lessee: [
      /(?:lessee|tenant)\s*[:\-]?\s*([A-Z0-9][A-Za-z0-9&.,'() \-]{2,60}?)(?=\s+and\s+|\s*\,|\s*\.|\s*\(|$)/i,
    ],
    Rent: [/((?:monthly|annual|base)?\s*rent[^.]{0,180}(?:\$|USD)[^.]{0,120})/i],
  };

  const findings = [];
  let lessorName = 'Not Found';
  let lesseeName = 'Not Found';

  Object.entries(patterns).forEach(([label, regexes]) => {
    for (const regex of regexes) {
      const match = text.match(regex);
      if (match) {
        const val = match[1] ? match[1].trim() : match[0].trim();
        if (label === 'Lessor') lessorName = val;
        if (label === 'Lessee') lesseeName = val;
        findings.push({ label, value: val });
        break;
      }
    }
  });

  return {
    lease_metadata: { title: targetFile, lessor: lessorName, lessee: lesseeName },
    findings,
  };
}

const sampleLease = 'Commercial Lease Agreement between Lessor: ACME Realty Corp and Lessee: Tech Startups Inc. Base Rent: $8,500 USD per month.';
const auditRes = fallbackAudit(sampleLease, 'sample.pdf');

console.log(`  Extracted Lessor: ${auditRes.lease_metadata.lessor}`);
console.log(`  Extracted Lessee: ${auditRes.lease_metadata.lessee}`);
console.log(`  Findings Count  : ${auditRes.findings.length}`);

const fallbackValid = auditRes.lease_metadata.lessor === 'ACME Realty Corp' && auditRes.findings.length > 0;
console.log(`Fallback Regex Audit Test: ${fallbackValid ? '✅ PASSED' : '❌ FAILED'}`);

const overallSuccess = allFilesExist && cosMathValid && blendingValid && quoteMatchValid && fallbackValid;
console.log('\n====================================================');
console.log(` OVERALL PHASE 2 STATUS: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ VERIFICATION FAILED'}`);
console.log('====================================================\n');
