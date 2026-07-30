'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Play, AlertTriangle, CheckCircle, Database, Download, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { AuditResult, Annotation } from '@/lib/types';
import { showErrorToast } from '@/lib/errorMessages';
import { RiskGauge } from './RiskGauge';
import { FindingCard } from './FindingCard';
import { CommitModal } from './CommitModal';
import { ObligationTimeline } from './ObligationTimeline';
import { AuditSkeleton } from './AuditSkeleton';
import { FileUploadStatus } from './FileUploadStatus';
import { PricingModal } from './PricingModal';
import { ApiKeyModal } from './ApiKeyModal';
import { ContactSalesModal } from './ContactSalesModal';
import { toast } from 'sonner';

import { parsePdfLayout } from '@/lib/pdfParser';
import { chunkDocumentLayouts } from '@/lib/browserChunker';
import {
  saveLocalDocument,
  getLocalDocument,
  getStoredDocumentNames,
  setLocalAuditResult,
  locateSnippetLocally
} from '@/lib/localDocumentStore';
import { runClientAudit } from '@/lib/clientAuditEngine';

interface LeftPaneProps {
  selectedDoc: string | null;
  onSelectDoc: (doc: string) => void;
  auditResult: AuditResult | null;
  onAuditStart: () => void;
  onAuditComplete: (result: AuditResult) => void;
  onLocate: (annotation: Annotation) => void;
  onCommitChange?: (committed: boolean) => void;
  isAuditRunning?: boolean;
  documents: string[];
  setDocuments: (docs: string[]) => void;
}

export function LeftPane({
  documents, setDocuments,
  selectedDoc, onSelectDoc, auditResult,
  onAuditStart, onAuditComplete, onLocate, onCommitChange, isAuditRunning = false
}: LeftPaneProps) {
  const [isAuditing, setIsAuditing] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | undefined>();
  const [auditStatus, setAuditStatus] = useState('Analyzing Clauses...');
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isContactSalesModalOpen, setIsContactSalesModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusCycleRef = useRef<NodeJS.Timeout | null>(null);
  const analysisLoading = isAuditing || isAuditRunning;

  const auditStatuses = ['Analyzing Clauses...', 'Extracting Lessor...', 'Scoring Risk...'];
  let statusIndex = 0;

  useEffect(() => {
    if (!selectedDoc) return;
    setIsIndexing(true);
    // Check if doc exists locally first
    const localDoc = getLocalDocument(selectedDoc);
    if (localDoc) {
      setIsIndexing(false);
      if (localDoc.auditResult) {
        onAuditComplete(localDoc.auditResult);
      } else {
        runAuditForDoc(localDoc.fileName, localDoc.fullText);
      }
    } else {
      api.checkIndex(selectedDoc)
        .catch(console.error)
        .finally(() => setIsIndexing(false));
    }
  }, [selectedDoc]);

  useEffect(() => {
    return () => {
      if (statusCycleRef.current) {
        clearInterval(statusCycleRef.current);
      }
    };
  }, []);

  const processLocalPdfFile = async (file: File) => {
    setIsUploading(true);
    setPipelineStatus('PROCESSING');
    setPipelineError(undefined);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pages = await parsePdfLayout(arrayBuffer);
      const chunkedDoc = chunkDocumentLayouts(file.name, pages);
      const docState = saveLocalDocument(file.name, file, pages, chunkedDoc);

      const allNames = getStoredDocumentNames();
      setDocuments(allNames);
      onSelectDoc(file.name);

      setPipelineStatus(null);
      await runAuditForDoc(docState.fileName, docState.fullText);
    } catch (error: any) {
      console.error('Local PDF Parsing failed:', error);
      try {
        const res = await api.upload(file);
        const docsRes = await api.documents();
        setDocuments(docsRes.documents ?? []);
        onSelectDoc(res.file_name ?? '');
      } catch (backendErr) {
        setPipelineStatus('FAILED');
        setPipelineError(error?.message || 'PDF Parsing Failed');
        showErrorToast(error, 'PDF Processing Failed');
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processLocalPdfFile(file);
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      await processLocalPdfFile(file);
    }
  };

  const runAuditForDoc = async (fileName: string, fullText: string) => {
    setIsAuditing(true);
    setCommitted(false);
    onCommitChange?.(false);
    onAuditStart();

    statusIndex = 0;
    setAuditStatus(auditStatuses[0]);
    statusCycleRef.current = setInterval(() => {
      statusIndex = (statusIndex + 1) % auditStatuses.length;
      setAuditStatus(auditStatuses[statusIndex]);
    }, 1500);

    try {
      let result: AuditResult;
      const localDoc = getLocalDocument(fileName);
      const textToAudit = fullText || localDoc?.fullText || '';

      if (textToAudit && textToAudit.trim().length > 0) {
        result = await runClientAudit(textToAudit, fileName);
      } else {
        try {
          result = await api.audit(fileName);
        } catch (apiErr) {
          result = await runClientAudit(fileName, fileName);
        }
      }

      setLocalAuditResult(fileName, result);
      onAuditComplete(result);
    } catch (e) {
      console.error('Audit failed:', e);
      // Zero-credit guard: show toast and open pricing modal
      if (e instanceof Error && e.message.startsWith('ZERO_CREDITS')) {
        toast.error('You have used your 3 free extractions. Upgrade or bring your own Groq API key to continue.');
        setIsPricingModalOpen(true);
      } else {
        showErrorToast(e, 'Audit Failed');
      }
    } finally {
      setIsAuditing(false);
      if (statusCycleRef.current) {
        clearInterval(statusCycleRef.current);
        statusCycleRef.current = null;
      }
    }
  };

  const handleRunAudit = async () => {
    if (!selectedDoc) return;
    const localDoc = getLocalDocument(selectedDoc);
    await runAuditForDoc(selectedDoc, localDoc?.fullText || '');
  };

  const handleLocateSnippet = async (snippet: string) => {
    if (!selectedDoc) return;
    const localAnnotation = locateSnippetLocally(selectedDoc, snippet);
    if (localAnnotation) {
      onLocate(localAnnotation);
      return;
    }
    try {
      const res = await api.locate(selectedDoc, snippet);
      if (res.found && res.annotation) {
        onLocate(res.annotation);
      }
    } catch (e) {
      console.error('Locate failed:', e);
      showErrorToast(e, 'Location Failed');
    }
  };

  const handleCommit = async () => {
    if (!selectedDoc) return;
    setIsCommitting(true);
    try {
      try {
        await api.commit(selectedDoc);
      } catch (err) {}
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`ls_committed_${selectedDoc}`, 'true');
      }
      setCommitted(true);
      onCommitChange?.(true);
      setShowCommitModal(false);
    } catch (e) {
      console.error('Commit failed:', e);
      showErrorToast(e, 'Commit Failed');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleExport = async () => {
    if (!selectedDoc || !auditResult) return;
    try {
      const blob = await api.exportAuditPdf(selectedDoc, auditResult);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Audit_Report_${selectedDoc}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditResult, null, 2));
      const a = document.createElement('a');
      a.href = dataStr;
      a.download = `Audit_Report_${selectedDoc}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const isFindingVerified = (finding: AuditResult['findings'][number]) => {
    const status = String(finding.verification_status || '').toLowerCase();
    return Boolean(
      finding.verified ||
      finding.is_verified ||
      finding.grounded ||
      status.includes('verified') ||
      status.includes('grounded') ||
      (auditResult?.live_trust_scores?.is_trusted && (auditResult.live_trust_scores.groundedness_index ?? 0) >= 0.98)
    );
  };

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleFileDrop}
    >
      {/* Document Selector Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
          Document
        </label>
        <div className="relative">
          <select
            value={selectedDoc || ''}
            onChange={e => onSelectDoc(e.target.value)}
            className="w-full appearance-none rounded-lg px-3 py-2 pr-8 text-sm outline-none cursor-pointer"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <option value="">Select a document...</option>
            {documents.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                       style={{ color: 'var(--text-secondary)' }} />
        </div>

        <div className="flex gap-2 mt-2">
          <input
            type="file"
            accept=".pdf"
            ref={fileInputRef}
            onChange={handleUpload}
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50" 
            style={{ background: 'var(--accent-primary)', color: '#fff' }}
          >
            {isUploading ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Upload PDF
          </button>
          
          <a href={api.auditLogUrl()} download className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all hover:bg-gray-100" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
            <Download className="w-3.5 h-3.5" />
            Audit Log
          </a>
        </div>

        {/* Run Audit Button */}
        <button
          onClick={handleRunAudit}
          disabled={!selectedDoc || analysisLoading || isIndexing}
          className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: analysisLoading || isIndexing ? 'var(--bg-card)' : 'var(--accent-primary)',
            color: analysisLoading || isIndexing ? 'var(--accent-primary)' : '#ffffff',
            border: analysisLoading || isIndexing ? '1px solid var(--accent-primary)' : 'none',
          }}
        >
          {analysisLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              {auditStatus}
            </>
          ) : isIndexing ? (
            <>
              <div className="w-4 h-4 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
              Indexing Document...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Intelligent Audit
            </>
          )}
        </button>
      </div>

      {/* File Upload Status */}
      {pipelineStatus && (
        <div className="px-4 pb-2">
          <FileUploadStatus status={pipelineStatus} error={pipelineError} />
        </div>
      )}

      {/* Scrollable Results Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {analysisLoading ? (
          <AuditSkeleton />
        ) : auditResult ? (
          <>
            {/* Success Box */}
            <div className="rounded-lg p-3 flex flex-col gap-1"
                 style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
              <span className="text-sm font-semibold">✨ Look what we found</span>
              <span className="text-xs">We processed the lease document and extracted key information. Please review for accuracy.</span>
            </div>

            {/* Risk Gauge + Warnings */}
            <div className="flex items-start gap-4">
              <RiskGauge score={auditResult.risk_score || 1} />
              <div className="flex-1 space-y-1.5">
                {auditResult.warnings?.length > 0 ? (
                  auditResult.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs rounded-md p-2"
                         style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)' }}>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-2 text-xs rounded-md p-2"
                       style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)' }}>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>No issues detected</span>
                  </div>
                )}
              </div>
            </div>

            {/* Findings */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-secondary)' }}>
                Key Findings
              </h3>
              <div className="space-y-2">
                {auditResult.findings.map((f, i) => (
                  <FindingCard key={i} finding={f} index={i} onLocate={handleLocateSnippet} verified={isFindingVerified(f)} />
                ))}
              </div>
            </div>

            {/* Smart Obligation Timeline */}
            {auditResult.obligations && (
              <ObligationTimeline obligations={auditResult.obligations} />
            )}

            {/* Executive Brief */}
            {auditResult.summary_paragraph && (
              <div className="rounded-lg p-3"
                   style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--text-secondary)' }}>
                  Executive Brief
                </h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {auditResult.summary_paragraph}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <div className="flex-1">
                {committed ? (
                  <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm"
                       style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <CheckCircle className="w-4 h-4" />
                    Committed as Legal Precedent
                  </div>
                ) : (
                  <button onClick={() => setShowCommitModal(true)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold glow-primary transition-all"
                          style={{ background: 'var(--accent-primary)', color: '#ffffff' }}>
                    <Database className="w-4 h-4" />
                    Commit to Knowledge Base
                  </button>
                )}
              </div>
              
              {/* Export Button */}
              <button onClick={handleExport}
                      className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
                      style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center py-20">
            <div>
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                   style={{ background: 'var(--bg-card)' }}>
                <Play className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Select a document and run an audit to see results
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Commit Modal */}
      {showCommitModal && (
        <CommitModal
          onConfirm={handleCommit}
          onCancel={() => setShowCommitModal(false)}
          isCommitting={isCommitting}
        />
      )}

      {/* Zero-Credit Guard Modals */}
      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        onOpenApiKeyModal={() => setIsKeyModalOpen(true)}
        onOpenContactSalesModal={() => setIsContactSalesModalOpen(true)}
      />
      <ApiKeyModal isOpen={isKeyModalOpen} onClose={() => setIsKeyModalOpen(false)} />
      <ContactSalesModal isOpen={isContactSalesModalOpen} onClose={() => setIsContactSalesModalOpen(false)} />
    </div>
  );
}
