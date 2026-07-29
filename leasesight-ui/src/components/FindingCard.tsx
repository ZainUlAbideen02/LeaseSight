'use client';

import { Search } from 'lucide-react';
import { Finding } from '@/lib/types';

interface FindingCardProps {
  finding: Finding;
  index: number;
  onLocate: (snippet: string) => void;
  verified?: boolean;
}

export function FindingCard({ finding, index, onLocate, verified = false }: FindingCardProps) {
  const isNotFound = finding.value.toLowerCase() === 'not found';
  const hasEvidence = finding.evidence_quote && finding.evidence_quote.toLowerCase() !== 'not found';

  return (
    <div
      onClick={() => !isNotFound && hasEvidence && onLocate(finding.evidence_quote)}
      className={`rounded-lg p-3 animate-fade-in transition-all ${!isNotFound && hasEvidence ? 'cursor-pointer hover:border-emerald-500/50 hover:shadow-sm' : ''}`}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {finding.label}
          </p>
          <p className="text-sm font-semibold truncate"
             style={{ color: isNotFound ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
            {finding.value}
          </p>
          {verified && hasEvidence && (
            <span className="mt-2 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
              ✓ Verbatim Grounded (100% Correct)
            </span>
          )}
        </div>
        {!isNotFound && hasEvidence && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLocate(finding.evidence_quote);
            }}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md transition-all hover:scale-105"
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
            title="Locate in document"
          >
            <Search className="w-3.5 h-3.5" style={{ color: 'var(--accent-emerald)' }} />
          </button>
        )}
      </div>
    </div>
  );
}
