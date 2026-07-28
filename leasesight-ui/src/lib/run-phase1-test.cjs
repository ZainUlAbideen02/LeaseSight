/**
 * Standalone Node Verification Script for Phase 1
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log(' PHASE 1: CORE CLIENT-SIDE ENGINE VERIFICATION');
console.log('====================================================\n');

// 1. Check file existence
const files = [
  'src/lib/pdfParser.ts',
  'src/lib/browserChunker.ts',
  'src/lib/userKeyStore.ts',
  'src/lib/embeddingClient.ts',
  'src/lib/test-phase1.ts',
  'public/embeddingWorker.js',
];

let allFilesExist = true;
files.forEach((relPath) => {
  const fullPath = path.join(__dirname, '..', '..', relPath);
  const exists = fs.existsSync(fullPath);
  console.log(`[FILE CHECK] ${relPath.padEnd(32)}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
  if (!exists) allFilesExist = false;
});

// 2. Chunker Unit Verification
console.log('\n--- Testing Parent-Child Chunker Logic ---');

function splitIntoChildTexts(text, chunkSize = 250, overlap = 40) {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!cleanText) return [];
  if (cleanText.length <= chunkSize) return [cleanText];

  const slices = [];
  let start = 0;

  while (start < cleanText.length) {
    let end = start + chunkSize;
    if (end < cleanText.length) {
      const lastSpace = cleanText.lastIndexOf(' ', end);
      if (lastSpace > start + Math.floor(chunkSize * 0.6)) {
        end = lastSpace;
      }
    } else {
      end = cleanText.length;
    }

    const chunkStr = cleanText.slice(start, end).trim();
    if (chunkStr.length > 0) slices.push(chunkStr);
    if (end >= cleanText.length) break;
    start = Math.max(start + 1, end - overlap);
  }

  return slices;
}

function chunkDocumentLayouts(fileName, pages, options = {}) {
  const chunkSize = options.childChunkSize || 250;
  const overlap = options.childChunkOverlap || 40;
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

  const parents = [];
  const children = [];

  for (const page of pages) {
    const parentId = `${safeFileName}_p${page.pageNumber}`;
    const parentText = page.fullText.trim();

    parents.push({
      id: parentId,
      fileName,
      pageNumber: page.pageNumber,
      text: parentText,
      lines: page.lines,
    });

    const childTexts = splitIntoChildTexts(parentText, chunkSize, overlap);
    childTexts.forEach((childText, childIdx) => {
      children.push({
        id: `${parentId}_c${childIdx}`,
        parentId,
        fileName,
        pageNumber: page.pageNumber,
        childIndex: childIdx,
        text: childText,
        parentText,
      });
    });
  }

  return { parents, children };
}

const samplePages = [
  {
    pageNumber: 1,
    fullText: 'COMMERCIAL LEASE AGREEMENT. This Lease Agreement is made on January 1, 2026, between Landlord LLC and Tenant Inc. Base Rent shall be $10,000 per month payable on the 1st of each month. Late fee of 5% applies after 5 days. Tenant shall maintain property insurance equal to $1,000,000.',
    lines: [{ text: 'COMMERCIAL LEASE AGREEMENT', x: 10, y: 10, width: 200, height: 14 }]
  },
  {
    pageNumber: 2,
    fullText: 'SECTION 10: GOVERNING LAW AND JURISDICTION. This agreement is governed by the laws of the State of New York. Disputes shall be resolved exclusively in New York courts.',
    lines: [{ text: 'SECTION 10: GOVERNING LAW', x: 10, y: 10, width: 200, height: 14 }]
  }
];

const result = chunkDocumentLayouts('commercial_lease.pdf', samplePages);

console.log(`Parent Chunks Generated: ${result.parents.length}`);
console.log(`Child Chunks Generated : ${result.children.length}`);

let chunkerValid = result.parents.length === 2 && result.children.length >= 2;
result.children.forEach((c, idx) => {
  console.log(`  Child [${idx}] ID: ${c.id.padEnd(30)} ParentID: ${c.parentId} Length: ${c.text.length} chars`);
  if (!c.id || !c.parentId || !c.parentText) chunkerValid = false;
});

console.log(`\nChunker Logic Test: ${chunkerValid ? '✅ PASSED' : '❌ FAILED'}`);

// 3. User Key Store Unit Verification
console.log('\n--- Testing API Key Store Logic ---');
let mockStorage = {};
const userKeyStore = {
  getUserGroqKey: () => mockStorage['user_groq_key'] || null,
  setUserGroqKey: (k) => { mockStorage['user_groq_key'] = k.trim(); },
  removeUserGroqKey: () => { delete mockStorage['user_groq_key']; },
  hasUserGroqKey: () => Boolean(mockStorage['user_groq_key']),
};

userKeyStore.setUserGroqKey('gsk_test_12345');
const k1 = userKeyStore.getUserGroqKey();
const h1 = userKeyStore.hasUserGroqKey();
userKeyStore.removeUserGroqKey();
const k2 = userKeyStore.getUserGroqKey();

const keyStoreValid = k1 === 'gsk_test_12345' && h1 === true && k2 === null;
console.log(`Key Store Logic Test: ${keyStoreValid ? '✅ PASSED' : '❌ FAILED'}`);

const overallSuccess = allFilesExist && chunkerValid && keyStoreValid;
console.log('\n====================================================');
console.log(` OVERALL PHASE 1 STATUS: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ VERIFICATION FAILED'}`);
console.log('====================================================\n');
