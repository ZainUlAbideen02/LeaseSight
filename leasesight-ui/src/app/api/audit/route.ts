import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const AUDIT_PROMPT = `
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { documentText, fileName = 'Contract.pdf', customApiKey } = body;

    if (!documentText || typeof documentText !== 'string') {
      return NextResponse.json(
        { error: 'Invalid documentText provided' },
        { status: 400 }
      );
    }

    const apiKey =
      (customApiKey && customApiKey.trim().length > 0)
        ? customApiKey.trim()
        : (process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || '');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'No Groq API key configured on system or request' },
        { status: 500 }
      );
    }

    const groq = new Groq({ apiKey });
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

    return NextResponse.json({ success: true, result: parsed });
  } catch (err: any) {
    console.error('[API /api/audit] Error processing Groq audit:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to execute Groq audit' },
      { status: 500 }
    );
  }
}
