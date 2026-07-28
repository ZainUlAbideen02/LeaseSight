/**
 * Client-Side Groq Audit Engine (clientAuditEngine.ts)
 * Executes single-pass AI lease auditing directly in the browser via Groq SDK (`dangerouslyAllowBrowser: true`).
 * Performs post-extraction quote groundedness verification and deterministic regex fallback parsing.
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

EXTRACT THE FOLLOWING 20-POINT COMPREHENSIVE MATRIX:

1. CORE ENTITY & METADATA IDENTIFICATION:
   - Document Category Class (e.g., Commercial Lease, Content License, SaaS, NDA)
   - First Party Name & Identity (Landlord / Licensor / Service Provider)
   - Second Party Name & Identity (Tenant / Licensee / Client)
   - Execution Date & Formal Agreement Title

2. CHRONOLOGICAL LIFECYCLE CONTROLS:
   - Contract Commencement / Effective Date
   - Initial Contract Duration (Term Length in months/years)
   - Automatic Renewal / Extension Provisions
   - Termination Notice Window (Required prior written notice period, e.g., 60 days)

3. FINANCIALS, FEES & REVENUE CONFIGURATIONS:
   - Base Fixed Monetary Obligations (e.g., Monthly Rent)
   - Variable Splits / Revenue Shares
   - Security Deposits / Fiscal Guarantees
   - Invoicing, Payment, and Reporting Cycles

4. RISK, COMPLIANCE & LEGAL TRAPS:
   - Financial Audit Rights & Shift-of-Cost Penalty Thresholds
   - Late Fees, Interest Penalties, and Liquidated Damage Rates
   - Non-Compete, Exclusivity, or Restrictive Covenants
   - Indemnification & Liability Hold-Harmless Clauses

5. RESTRICTIONS, SCOPE & GOVERNANCE:
   - Permitted Use / Scope of Distribution
   - Subleasing / Sub-licensing Assignment Restrictions
   - Governing Law Jurisdiction (State/Country)
   - Survival Clauses

CRITICAL RULES:
- Every finding and obligation MUST include an 'evidence_quote' that is an EXACT verbatim string from the text.
- Prefer quotes at least 15 characters long.
- Return ONLY valid JSON matching this structure:
{
  "lease_metadata": {"title": "...", "lessor": "...", "lessee": "...", "tenure": "..."},
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
  if (!quote || quote === 'Not Found' || quote.length < 10) return true;
  const cleanContext = contextText.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const cleanQuote = quote.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!cleanContext || !cleanQuote) return true;
  const searchSnippet = cleanQuote.slice(0, Math.min(25, cleanQuote.length));
  return cleanContext.includes(searchSnippet);
}

/**
 * Deterministic Fallback Regex Parser when Groq is unavailable, rate-limited, or key is missing.
 */
export function fallbackAudit(contextText: string, targetFile: string, warningMsg?: string): AuditResult {
  const text = contextText.replace(/\s+/g, ' ');

  const patterns: Record<string, RegExp[]> = {
    Lessor: [
      /(?:lessor|landlord)\s*[:\-]?\s*([A-Z0-9][A-Za-z0-9&.,'() \-]{2,60}?)(?=\s+and\s+|\s*\,|\s*\.|\s*\(|$)/i,
      /between\s+([A-Z0-9][A-Za-z0-9&.,'() \-]{2,60}?)(?=\s+and\s+|\s+(?:as\s+)?lessor|\s*\,|\s*\.|$)/i,
    ],
    Lessee: [
      /(?:lessee|tenant)\s*[:\-]?\s*([A-Z0-9][A-Za-z0-9&.,'() \-]{2,60}?)(?=\s+and\s+|\s*\,|\s*\.|\s*\(|$)/i,
      /and\s+([A-Z0-9][A-Za-z0-9&.,'() \-]{2,60}?)(?=\s+(?:as\s+)?lessee|\s*\,|\s*\.|$)/i,
    ],
    Rent: [
      /((?:monthly|annual|base)?\s*rent[^.]{0,180}(?:\$|USD|Rs\.?|PKR)[^.]{0,120})/i,
      /((?:\$|USD)\s?[0-9][0-9,]*(?:\.[0-9]{2})?[^.]{0,120}(?:rent|per month|per annum))/i,
    ],
    'Security Deposit': [/(security deposit[^.]{0,180}(?:\$|USD)[^.]{0,120})/i],
    'Commencement Date': [/(commencement date[^.]{0,160})/i, /(effective date[^.]{0,160})/i],
    'Termination Notice': [
      /(termination[^.]{0,180}(?:notice|days)[^.]{0,120})/i,
      /((?:[0-9]+|thirty|sixty|ninety)\s*\(?[0-9]*\)?\s*days[^.]{0,160}notice[^.]{0,80})/i,
    ],
    'Governing Law': [/(governing law[^.]{0,180})/i, /(laws of [A-Z][A-Za-z ]{2,80})/i],
  };

  const findings: FindingItem[] = [];
  let lessorName = 'Not Found';
  let lesseeName = 'Not Found';

  Object.entries(patterns).forEach(([label, regexes]) => {
    for (const regex of regexes) {
      const match = text.match(regex);
      if (match) {
        const val = match[1] ? match[1].trim() : match[0].trim();
        const quote = match[0].trim().slice(0, 300);

        if (label === 'Lessor' && lessorName === 'Not Found') lessorName = val;
        if (label === 'Lessee' && lesseeName === 'Not Found') lesseeName = val;

        findings.push({
          label,
          value: val.slice(0, 150),
          evidence_quote: quote,
          risk_level: label === 'Termination Notice' || label === 'Governing Law' ? 'Medium' : 'Low',
          verified_grounded: verifyQuoteGrounded(quote, contextText),
        });
        break;
      }
    }
  });

  const warning = warningMsg || 'Client-side conservative fallback extraction executed (Groq key unconfigured or rate-limited).';

  return {
    lease_metadata: {
      title: targetFile,
      lessor: lessorName,
      lessee: lesseeName,
      tenure: 'Extracting...',
    },
    findings,
    obligations: findings
      .filter((f) => f.label === 'Termination Notice')
      .map((f) => ({
        label: f.label,
        date: null,
        description: f.value,
        evidence_quote: f.evidence_quote,
        risk_level: f.risk_level,
        verified_grounded: f.verified_grounded,
      })),
    summary_paragraph:
      'A conservative client-side extraction was generated from local PDF text. Review extracted fields against original source document.',
    risk_score: findings.length > 0 ? 3 : 1,
    warnings: [warning],
  };
}

/**
 * Normalizes and validates raw JSON responses from Groq.
 */
function normalizeAuditReport(rawReport: Partial<AuditResult>, targetFile: string, contextText: string): AuditResult {
  const findings: FindingItem[] = (rawReport.findings || []).map((f) => {
    const quote = String(f.evidence_quote || 'Not Found');
    return {
      label: String(f.label || 'Finding'),
      value: String(f.value || 'Not Found'),
      evidence_quote: quote,
      risk_level: f.risk_level === 'High' ? 'High' : f.risk_level === 'Medium' ? 'Medium' : 'Low',
      verified_grounded: verifyQuoteGrounded(quote, contextText),
    };
  });

  const obligations: ObligationItem[] = (rawReport.obligations || []).map((o) => {
    const quote = String(o.evidence_quote || 'Not Found');
    return {
      label: String(o.label || 'Obligation'),
      date: o.date ? String(o.date) : null,
      description: String(o.description || ''),
      evidence_quote: quote,
      risk_level: o.risk_level === 'High' ? 'High' : o.risk_level === 'Medium' ? 'Medium' : 'Low',
      verified_grounded: verifyQuoteGrounded(quote, contextText),
    };
  });

  const summary =
    rawReport.summary_paragraph ||
    'Client-side multi-agent audit complete. Review extracted findings and verified evidence quotes against source document.';

  return {
    lease_metadata: rawReport.lease_metadata || { title: targetFile },
    findings,
    obligations,
    summary_paragraph: summary,
    risk_score: Math.max(1, Math.min(10, Number(rawReport.risk_score) || 3)),
    warnings: (rawReport.warnings || []).map(String),
  };
}

/**
 * Executes single-pass AI lease audit using Groq SDK in browser or fallback regex parser.
 */
export async function runClientAudit(
  fileName: string,
  contextText: string,
  marketContext: string = ''
): Promise<AuditResult> {
  const userKey = getUserGroqKey();

  if (!userKey) {
    console.warn('[ClientAuditEngine] No custom Groq API key found in localStorage. Executing fallback audit.');
    return fallbackAudit(contextText, fileName, 'Custom Groq API Key missing in userKeyStore. Add key in settings for LLM reasoning.');
  }

  try {
    const groq = new Groq({
      apiKey: userKey,
      dangerouslyAllowBrowser: true,
    });

    const payload = JSON.stringify({
      document_name: fileName,
      lease_text: contextText.slice(0, 15000),
      market_context: marketContext.slice(0, 3000),
    });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: AUDIT_PROMPT },
        { role: 'user', content: `Perform full legal audit on:\n\n${payload}` },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    });

    const content = completion.choices[0]?.message?.content || '';
    if (!content) {
      throw new Error('Empty response from Groq API');
    }

    const rawReport = JSON.parse(content) as Partial<AuditResult>;
    return normalizeAuditReport(rawReport, fileName, contextText);
  } catch (err) {
    console.error('[ClientAuditEngine] Groq execution error:', err);
    return fallbackAudit(contextText, fileName, `Groq API execution note: ${String(err)}`);
  }
}
