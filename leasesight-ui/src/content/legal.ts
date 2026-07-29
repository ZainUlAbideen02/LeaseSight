export type LegalPanel = 'terms' | 'privacy' | 'documentation';

export const LEGAL_PANELS: Record<
  LegalPanel,
  { title: string; subtitle: string; sections: { heading: string; body: string[] }[] }
> = {
  terms: {
    title: 'Terms of Service',
    subtitle: 'LeaseSight Technologies — Effective July 2026',
    sections: [
      {
        heading: '1. AI-Assisted Contract Review & Scope',
        body: [
          'LeaseSight provides automated legal document parsing, clause extraction, compliance heuristics, and structured audit outputs for commercial lease and logistics contracts. All insights are generated via computational analysis to assist qualified legal and real estate professionals.',
          'LeaseSight outputs do not constitute formal legal advice or create an attorney-client relationship. All extracted findings and risk scores should be verified against original source documents prior to executing binding agreements.',
        ],
      },
      {
        heading: '2. Subscription Plans & Credit Consumption',
        body: [
          'Free Tier accounts receive 3 initial contract audit credits per month. Starter Subscription ($5.00 / month) includes 25 managed monthly audits with automated obligation calendar sync.',
          'Pay-As-You-Go credits ($5.00 per 10 credits / $0.50 per audit) never expire. Bring Your Own Key (BYOK) users configure their own Groq or OpenAI keys for zero-credit, unlimited processing.',
        ],
      },
      {
        heading: '3. User Key Privacy & BYOK Principles',
        body: [
          'When using Bring Your Own Key (BYOK) mode, your Groq or OpenAI API key is stored 100% locally in your browser\'s localStorage (`user_groq_api_key`). It is never transmitted to, stored on, or processed by LeaseSight backend servers.',
          'You remain responsible for maintaining API key quotas, billing, and access security on your external model provider account.',
        ],
      },
      {
        heading: '4. Liability Disclaimers & Automated Auditing',
        body: [
          'LeaseSight applies schema-validated multi-point extraction algorithms to identify legal risks. However, LeaseSight Technologies disclaims liability for indirect, incidental, or consequential damages resulting from missed clauses, OCR artifacts, or model misinterpretations.',
          'Maximum aggregate direct liability is limited to fees paid in the twelve (12) months preceding any claim.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'LeaseSight Technologies — Data Protection & Privacy',
    sections: [
      {
        heading: '1. Zero Persistent Document Storage',
        body: [
          'Uploaded lease PDF contracts are processed 100% in transient process memory (RAM). Raw document text is parsed into layout chunks, mapped for bounding box coordinates, and discarded after processing.',
          'No contract text is permanently saved, cached, or written to external database servers unless explicitly saved to your local browser storage.',
        ],
      },
      {
        heading: '2. Model Inference & Training Exclusion',
        body: [
          'Contract text processed via managed Groq LPU endpoints or user-provided API keys is isolated strictly to the active inference session window (typically <1 second).',
          'Payloads are never retained, logged, or used for model training or fine-tuning under strict zero-data-retention commercial vendor agreements.',
        ],
      },
      {
        heading: '3. Browser Local Storage Security',
        body: [
          'Local document state, parsed page chunks, custom API keys, and audit credit balances are stored locally within your browser\'s sandbox. Clearing browser data or clicking "Log Out" purges transient session state.',
        ],
      },
    ],
  },
  documentation: {
    title: 'Platform Quick-Start Documentation',
    subtitle: 'LeaseSight User Guide & Workflow Overview',
    sections: [
      {
        heading: 'Step 1 — BYOK API Key Setup',
        body: [
          'Click the "BYOK KEY" or Settings button in the top navigation bar. Enter your custom Groq API key (`gsk_...`) or OpenAI key (`sk-...`) and click Save Key.',
          'Once saved, your key activates automatically for unlimited, zero-credit contract audits with sub-second LPU inference acceleration.',
        ],
      },
      {
        heading: 'Step 2 — Uploading Lease PDFs',
        body: [
          'From the Audit Dashboard, click "Upload PDF" or drop a commercial lease contract directly into the browser workspace.',
          'LeaseSight\'s browser-native PDF parser (`pdfjs-dist`) extracts page layouts, line text, and point coordinates instantly in client memory.',
        ],
      },
      {
        heading: 'Step 3 — Interpreting Risk Scores & Bounding Box Highlights',
        body: [
          'Click "Run Intelligent Audit" to execute the 10-point legal compliance matrix. Review the 1/10 Weighted Criticality Risk Score and extracted compliance finding cards.',
          'Click any Key Finding card to automatically scroll the PDF viewer directly to the target clause with glowing amber bounding box overlays mapped 1:1 over original source text.',
        ],
      },
      {
        heading: 'Step 4 — Summary & JSON Exports',
        body: [
          'Export audit findings, chronological obligation timelines, and executive briefs by clicking the "Export" button to download structured JSON or PDF summary reports.',
        ],
      },
    ],
  },
};
