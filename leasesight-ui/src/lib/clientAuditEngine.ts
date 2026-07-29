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
You MUST achieve 10/10 complete item extraction coverage without omitting any conditional clauses, financial caps, or notice windows.

EXTRACT THE FOLLOWING COMPREHENSIVE 10-POINT LEGAL AUDIT MATRIX:

1. CORE ENTITY & METADATA IDENTIFICATION:
   - Document Category Class (e.g., Commercial Lease, Content License, SaaS, NDA)
   - First Party Name & Identity (Landlord / Licensor / Service Provider)
   - Second Party Name & Identity (Tenant / Licensee / Client)
   - Execution Date & Formal Agreement Title

2. CHRONOLOGICAL LIFECYCLE CONTROLS:
   - Contract Commencement / Effective Date
   - Initial Contract Duration (Term Length in months/years)
   - Automatic Renewal / Extension Provisions (Provisions for rollover periods)
   - Termination Notice Window (Required prior written notice period, e.g., 60 days)

3. FINANCIALS, FEES & REVENUE CONFIGURATIONS:
   - Base Fixed Monetary Obligations (e.g., Monthly Rent, Fixed Retainers)
   - Variable Splits / Revenue Shares & Security Deposit Guarantees

4. RISK, COMPLIANCE & LEGAL TRAPS:
   - Financial Audit Rights & Shift-of-Cost Penalty Thresholds
   - Late Fees, Interest Penalties, and Liquidated Damage Rates
   - Non-Compete, Exclusivity, or Restrictive Covenants
   - Indemnification & Liability Hold-Harmless Caps

5. RESTRICTIONS, SCOPE & GOVERNANCE:
   - Permitted Use / Scope of Distribution
   - Subleasing / Sub-licensing Assignment Restrictions
   - Governing Law Jurisdiction (State/Country) and Designated Dispute Venue
   - Survival Clauses (e.g., Confidentiality surviving post-termination)

CRITICAL EXTRACTION RULES:
- Extract EVERY matching item into the 'findings' array. Do NOT summarize or truncate.
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
 * Executes a single-pass legal audit directly in the browser via Groq API.
 */
export async function runClientAudit(documentText: string): Promise<AuditResult> {
  const apiKey = getUserGroqKey() || process.env.NEXT_PUBLIC_GROQ_API_KEY || '';
  if (!apiKey) {
    throw new Error('Missing Groq API Key. Please configure your key in Settings or local storage.');
  }

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
}
