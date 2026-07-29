import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface Props {
  status: string | null;
  error?: string;
}

export function FileUploadStatus({ status, error }: Props) {
  const [step, setStep] = useState(1);

  // Artificially cycle through the 3 steps while processing
  useEffect(() => {
    if (status !== 'QUEUED' && status !== 'PENDING' && status !== 'PROCESSING') {
      return;
    }
    const interval = setInterval(() => {
      setStep(s => (s < 3 ? s + 1 : s));
    }, 4000);
    return () => clearInterval(interval);
  }, [status]);

  if (!status) return null;

  if (status === 'FAILED') {
    return (
      <div className="flex items-center gap-2 p-3 text-sm rounded-lg border border-red-200 bg-red-50 text-red-600 mt-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>Pipeline Execution Interrupted. Falling back to structured inspection. {error}</span>
      </div>
    );
  }

  if (status === 'QUEUED' || status === 'PENDING' || status === 'PROCESSING') {
    return (
      <div className="mt-3 p-4 border border-[var(--border-default)] rounded-lg bg-[var(--bg-card)] space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
          <span>Processing Document in Background</span>
        </div>
        <div className="space-y-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          <div className={`flex items-center gap-2 ${step >= 1 ? 'opacity-100' : 'opacity-40'}`}>
            {step > 1 ? <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--accent-emerald)' }} /> : <div className="w-3.5 h-3.5 rounded-full border border-current" />}
            1. Extracting text & coordinates via browser pdfjs-dist...
          </div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'opacity-100' : 'opacity-40'}`}>
            {step > 2 ? <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--accent-emerald)' }} /> : <div className="w-3.5 h-3.5 rounded-full border border-current" />}
            2. Generating local 768-D vectors...
          </div>
          <div className={`flex items-center gap-2 ${step >= 3 ? 'opacity-100' : 'opacity-40'}`}>
            {step > 3 ? <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--accent-emerald)' }} /> : <div className="w-3.5 h-3.5 rounded-full border border-current" />}
            3. Running multi-agent audit on Gemini...
          </div>
        </div>
      </div>
    );
  }

  return null;
}
