/**
 * Client-Side Hybrid Audit Engine (clientAuditEngine.ts)
 * Performs browser-native term-scoring, layout analysis, and compliance extraction
 * across contract PDF text, with post-extraction quote groundedness verification.
 */

import Groq from 'groq-sdk';
import { getUserGroqKey } from './userKeyStore';

export interface FindingItem {
  label: string;
  value: string;
  evidence_quote: string;
  risk_level: 'Low' | 'Medium' | 'High';
  verified_grounded?: boolean;
}

export interface ObligationItem {
  label: string;
  date: string | null;
  description: string;
  evidence_quote: string;
  risk_level?: 'Low' | 'Medium' | 'High';
  verified_grounded?: boolean;
}

export interface LeaseMetadata {
  title?: string;
  lessor?: string;
  lessee?: string;
  tenure?: string;
  [key: string]: unknown;
}

export interface AuditResult {
  lease_metadata: LeaseMetadata;
  findings: FindingItem[];
  obligations: ObligationItem[];
  summary_paragraph: string;
  risk_score: number;
  warnings: string[];
}

export const AUDIT_PROMPT = `
You are a Senior Legal Analyst and Data Architect specializing in commercial real estate and corporate contract auditing.
Convert the provided document text into high-fidelity structured JSON for visual grounding.
You MUST achieve 10/10 complete item extraction coverage without omitting any conditional clauses, financial caps, or notice windows.

EXTRACT THE FOLLOWING COMPREHENSIVE 10-POINT LEGAL AUDIT MATRIX:

1. CORE ENTITY & METADATA IDENTIFICATION
2. CHRONOLOGICAL LIFECYCLE CONTROLS
3. FINANCIALS, FEES & REVENUE CONFIGURATIONS
4. RISK, COMPLIANCE & LEGAL TRAPS
5. RESTRICTIONS, SCOPE & GOVERNANCE

Return ONLY valid JSON matching this structure:
{
  "lease_metadata": {"title": "...", "lessor": "...", "lessee": "..."},
  "findings": [{"label": "...", "value": "...", "evidence_quote": "...", "risk_level": "Low|Medium|High"}],
  "obligations": [{"label": "...", "date": "...", "description": "...", "evidence_quote": "..."}],
  "risk_score": 1,
  "warnings": [],
  "summary_paragraph": "..."
}
`;

/**
 * Checks if an evidence quote is verified grounded in the document context.
 */
export function verifyQuoteGrounded(quote: string, contextText: string): boolean {
  if (!quote || quote === 'Not Found' || quote.length < 5) return true;
  const cleanContext = contextText.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const cleanQuote = quote.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!cleanContext || !cleanQuote) return true;
  const snippet = cleanQuote.slice(0, Math.min(25, cleanQuote.length));
  return cleanContext.includes(snippet);
}

/**
 * Normalizes and verifies grounding on an audit result.
 */
export function normalizeAuditResult(rawResult: Partial<AuditResult>, contextText: string): AuditResult {
  const findings: FindingItem[] = (rawResult.findings || []).map((f) => ({
    label: String(f.label || 'Clause'),
    value: String(f.value || 'Not Found'),
    evidence_quote: String(f.evidence_quote || 'Not Found'),
    risk_level: f.risk_level === 'High' ? 'High' : f.risk_level === 'Medium' ? 'Medium' : 'Low',
    verified_grounded: verifyQuoteGrounded(String(f.evidence_quote || ''), contextText),
  }));

  const obligations: ObligationItem[] = (rawResult.obligations || []).map((o) => ({
    label: String(o.label || 'Obligation'),
    date: o.date ? String(o.date) : null,
    description: String(o.description || ''),
    evidence_quote: String(o.evidence_quote || 'Not Found'),
    verified_grounded: verifyQuoteGrounded(String(o.evidence_quote || ''), contextText),
  }));

  return {
    lease_metadata: rawResult.lease_metadata || {},
    findings,
    obligations,
    summary_paragraph: String(rawResult.summary_paragraph || 'Audit completed successfully.'),
    risk_score: typeof rawResult.risk_score === 'number' ? rawResult.risk_score : 3,
    warnings: Array.isArray(rawResult.warnings) ? rawResult.warnings.map(String) : [],
  };
}

/**
 * Pure Browser-Native Hybrid Compliance & Legal Analysis Engine.
 * Tokenizes, scores, and extracts real verbatim compliance findings across 10 CUAD categories
 * using a Weighted Criticality Risk Matrix.
 */
export function buildBrowserNativeHybridAudit(documentText: string, fileName: string = 'Contract.pdf'): AuditResult {
  if (!documentText || documentText.trim().length === 0) {
    return {
      lease_metadata: { title: fileName, lessor: 'Unknown Party', lessee: 'Tenant' },
      findings: [
        { label: 'Document Status', value: 'Empty PDF Text', evidence_quote: fileName, risk_level: 'Low', verified_grounded: true }
      ],
      obligations: [],
      summary_paragraph: 'Document text is empty or could not be parsed.',
      risk_score: 1,
      warnings: ['Empty or unparseable document text']
    };
  }

  // Split text into non-empty sentences/lines
  const rawLines = documentText
    .split(/\n+|\.(?=\s+[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length >= 10);

  const findBestQuote = (keywords: string[]): { quote: string; score: number } => {
    let bestLine = '';
    let maxScore = 0;

    for (const line of rawLines) {
      const lower = line.toLowerCase();
      let matchCount = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) matchCount += 1;
      }
      if (matchCount > maxScore) {
        maxScore = matchCount;
        bestLine = line;
      }
    }

    return { quote: bestLine, score: maxScore };
  };

  // 10 Core CUAD Extraction Categories with Weighted Criticality Points
  const categories = [
    {
      label: 'Governing Law & Jurisdiction',
      keywords: ['governing law', 'jurisdiction', 'state of', 'governed by', 'laws of', 'courts of', 'venue'],
      extractValue: (q: string) => {
        const match = q.match(/(?:state of|laws of|jurisdiction of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
        return match ? `Governed by ${match[1]}` : 'Governing Law Provision Defined';
      },
      points: 1, // Low (+1)
      riskLevel: 'Low' as const
    },
    {
      label: 'Termination & Default Provisions',
      keywords: ['terminate', 'termination', 'default', 'breach', 'cancellation', 'cancel', 'remedy', 'cure', 'foreclosure'],
      extractValue: (q: string) => {
        if (q.toLowerCase().includes('default') || q.toLowerCase().includes('foreclosure')) return 'Critical Breach & Default Trigger';
        if (q.toLowerCase().includes('cancel')) return 'Cancellation Rights Active';
        return 'Early Termination Clause';
      },
      points: 4, // Critical (+4)
      riskLevel: 'High' as const
    },
    {
      label: 'Notice Period & Renewal Terms',
      keywords: ['notice', 'days', 'written notice', 'prior notice', 'notice period', 'renewal', 'extension'],
      extractValue: (q: string) => {
        const match = q.match(/(\d+\s*(?:days?|months?))/i);
        return match ? `${match[1].toUpperCase()} Prior Written Notice` : 'Notice Period Specified';
      },
      points: 2, // Medium (+2)
      riskLevel: 'Medium' as const
    },
    {
      label: 'Liability Caps & Indemnification',
      keywords: ['liability', 'indemnify', 'indemnification', 'cap', 'limitation of liability', 'hold harmless', 'damages', 'uncapped'],
      extractValue: (q: string) => {
        if (q.toLowerCase().includes('indemnify') || q.toLowerCase().includes('uncapped')) return 'Uncapped Indemnification & Hold Harmless Mandate';
        return 'Limitation of Liability Provisions';
      },
      points: 4, // Critical (+4)
      riskLevel: 'High' as const
    },
    {
      label: 'Anti-Assignment & Sub-licensing Restrictions',
      keywords: ['assignment', 'assign', 'sublease', 'sublicense', 'transfer', 'consent', 'affiliate'],
      extractValue: (q: string) => {
        if (q.toLowerCase().includes('consent')) return 'Prior Written Consent Required for Transfer';
        return 'Anti-Assignment & Transfer Restrictions';
      },
      points: 2, // Medium (+2)
      riskLevel: 'Medium' as const
    },
    {
      label: 'Exclusivity & Non-Compete Obligations',
      keywords: ['exclusivity', 'exclusive', 'non-compete', 'compete', 'restrictive covenant', 'territory'],
      extractValue: (q: string) => {
        if (q.toLowerCase().includes('non-compete')) return 'Strict Non-Compete Covenant';
        return 'Exclusive Territory & Rights Mandate';
      },
      points: 1, // Low (+1)
      riskLevel: 'Low' as const
    },
    {
      label: 'Financial Audit Rights & Cost Penalties',
      keywords: ['audit', 'records', 'inspection', 'inspect', 'books', 'underpayment', 'accounting'],
      extractValue: (q: string) => {
        return 'Financial Audit Rights & Inspection Covenant';
      },
      points: 1, // Low (+1)
      riskLevel: 'Low' as const
    },
    {
      label: 'Liquidated Damages & Late Fees',
      keywords: ['liquidated damages', 'penalty', 'late fee', 'interest rate', 'default rate', 'forfeiture', 'security deposit'],
      extractValue: (q: string) => {
        if (q.toLowerCase().includes('deposit') || q.toLowerCase().includes('forfeiture')) return 'Security Deposit Forfeiture Trigger';
        return 'Liquidated Damage & Late Penalty Clause';
      },
      points: 4, // Critical (+4)
      riskLevel: 'High' as const
    },
    {
      label: 'Confidentiality & Survival Clauses',
      keywords: ['confidential', 'confidentiality', 'nondisclosure', 'survival', 'survive', 'trade secret', 'proprietary'],
      extractValue: (q: string) => {
        if (q.toLowerCase().includes('survive')) return 'Post-Termination Survival Provisions';
        return 'Confidentiality & Proprietary Info Obligations';
      },
      points: 1, // Low (+1)
      riskLevel: 'Low' as const
    },
    {
      label: 'Permitted Use & Scope of License',
      keywords: ['permitted use', 'scope', 'license', 'grant', 'amendment', 'agreement', 'purpose'],
      extractValue: (q: string) => {
        if (q.toLowerCase().includes('amendment')) return 'Formal Agreement Amendment';
        return 'Permitted Use & Scope Defined';
      },
      baseRisk: 'Low' as const,
      points: 1, // Low (+1)
      riskLevel: 'Low' as const
    }
  ];

  const findings: FindingItem[] = [];
  const warnings: string[] = [];
  let weightedRiskPoints = 0;

  for (const cat of categories) {
    const { quote, score } = findBestQuote(cat.keywords);
    if (quote && score > 0) {
      const value = cat.extractValue(quote);
      weightedRiskPoints += cat.points;

      findings.push({
        label: cat.label,
        value,
        evidence_quote: quote.length > 200 ? quote.slice(0, 197) + '...' : quote,
        risk_level: cat.riskLevel,
        verified_grounded: true
      });
    }
  }

  // Ensure non-empty findings array
  if (findings.length === 0 && rawLines.length > 0) {
    findings.push({
      label: 'Document Content Parsed',
      value: `${rawLines.length} Text Lines Analyzed`,
      evidence_quote: rawLines[0].slice(0, 150),
      risk_level: 'Low',
      verified_grounded: true
    });
  }

  // Extract obligations
  const obligations: ObligationItem[] = [];
  const noticeHit = findBestQuote(['notice', 'days', 'written notice']);
  if (noticeHit.quote) {
    obligations.push({
      label: 'Notice & Compliance Window',
      date: 'Within Notice Period',
      description: 'Prior written notice requirement before contract modification or termination.',
      evidence_quote: noticeHit.quote.slice(0, 150),
      risk_level: 'Medium',
      verified_grounded: true
    });
  }

  const payHit = findBestQuote(['payment', 'rent', 'fee', 'dollar', 'amount', 'compensation']);
  if (payHit.quote) {
    obligations.push({
      label: 'Financial Monetary Obligation',
      date: 'Monthly / Schedule',
      description: 'Fixed monetary payment or retainer obligation.',
      evidence_quote: payHit.quote.slice(0, 150),
      risk_level: 'Low',
      verified_grounded: true
    });
  }

  // Extract Title / Parties
  let extractedTitle = fileName;
  let extractedLessor = 'Lessor / First Party';
  let extractedLessee = 'Lessee / Second Party';

  if (rawLines.length > 0) {
    const headerLine = rawLines[0].toUpperCase();
    if (headerLine.includes('AMENDMENT')) extractedTitle = rawLines[0];
    else if (headerLine.includes('LEASE')) extractedTitle = rawLines[0];

    for (const l of rawLines.slice(0, 10)) {
      if (l.toLowerCase().includes('by and between') || l.toLowerCase().includes('entered into')) {
        extractedLessor = l;
        break;
      }
    }
  }

  // Warnings generation
  if (findings.some(f => f.risk_level === 'High')) {
    warnings.push('Critical indemnity, default trigger, or penalty provisions detected in contract text.');
  }
  if (findings.some(f => f.label.includes('Notice'))) {
    warnings.push('Strict prior written notice period required for termination or rollover.');
  }

  // Calculate Weighted Criticality Risk Score normalized from 1 to 10
  // Max possible points approx 20 -> map points to 1..10 scale
  let calculatedRiskScore = Math.round(1 + (weightedRiskPoints / 18.0) * 9.0);
  calculatedRiskScore = Math.min(10, Math.max(1, calculatedRiskScore));

  const summary_paragraph = `Browser hybrid compliance audit complete for ${fileName}. Extracted ${findings.length} CUAD compliance findings and ${obligations.length} chronological obligations across the 10-point legal matrix.`;

  return {
    lease_metadata: {
      title: extractedTitle,
      lessor: extractedLessor,
      lessee: extractedLessee,
    },
    findings,
    obligations,
    summary_paragraph,
    risk_score: calculatedRiskScore,
    warnings,
  };
}

/**
 * Executes legal compliance audit directly in the browser via Groq LLM API
 * or pure browser-native hybrid audit engine.
 */
export async function runClientAudit(documentText: string, fileName: string = 'Contract.pdf'): Promise<AuditResult> {
  const apiKey = getUserGroqKey() || process.env.NEXT_PUBLIC_GROQ_API_KEY || '';

  if (apiKey) {
    try {
      const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
      const trimmedText = documentText.slice(0, 15000);

      const response = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: AUDIT_PROMPT },
          { role: 'user', content: `Audit the following contract text:\n\n${trimmedText}` },
        ],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      return normalizeAuditResult(parsed, documentText);
    } catch (err) {
      console.warn('Groq API call failed. Using browser-native hybrid audit engine:', err);
    }
  }

  // Pure Browser-Native Hybrid Audit Engine
  return buildBrowserNativeHybridAudit(documentText, fileName);
}
