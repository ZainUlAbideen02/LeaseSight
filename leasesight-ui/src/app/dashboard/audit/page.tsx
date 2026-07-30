'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { FileText, ListChecks } from 'lucide-react';
import { Header } from '@/components/Header';
import { BackNavigation } from '@/components/BackNavigation';
import { LeftPane } from '@/components/LeftPane';
import { ChatOverlay } from '@/components/ChatOverlay';
import { NetworkPanel } from '@/components/NetworkPanel';
import { AuditResult, Annotation } from '@/lib/types';
import { setPlan, addCredits } from '@/lib/userStore';
import { toast } from 'sonner';

function PaymentListener() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const payment = searchParams.get('payment');
    const type = searchParams.get('type');

    if (payment === 'success') {
      if (type === 'starter') {
        setPlan('starter');
        toast.success('Starter Plan Activated! 25 Audits Available.');
      } else if (type === 'credits') {
        addCredits(10);
        toast.success('10 Audit Credits Added!');
      }
      if (typeof window !== 'undefined') {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
  }, [searchParams]);

  return null;
}

const RightPane = dynamic(() => import('@/components/RightPane').then(mod => mod.RightPane), {
  ssr: false,
  loading: () => (
    <div className="flex h-full flex-col items-center justify-center bg-[#F9FAFB] text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
      Loading Document Engine
    </div>
  ),
});

export default function AuditDashboard() {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [targetPage, setTargetPage] = useState<number>(1);
  const [isAuditing, setIsAuditing] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [isCommitted, setIsCommitted] = useState(false);
  const [networkQuery, setNetworkQuery] = useState<string | undefined>(undefined);
  const [documents, setDocuments] = useState<string[]>([]);
  const [mobileTab, setMobileTab] = useState<'document' | 'analysis'>('document');

  const { user } = useUser();

  useEffect(() => {
    if (user?.id) {
      import('@/lib/api').then(({ setApiAuthContext }) => {
        setApiAuthContext(user.id);
      });
    }
  }, [user?.id]);

  useEffect(() => {
    import('@/lib/localDocumentStore').then(({ getStoredDocumentNames }) => {
      const localDocs = getStoredDocumentNames();
      if (localDocs.length > 0) {
        setDocuments(localDocs);
        if (!selectedDoc) setSelectedDoc(localDocs[0]);
      }
    });

    import('@/lib/api').then(({ api }) => {
      api.documents().then(d => {
        if (d.documents && d.documents.length > 0) {
          setDocuments(prev => Array.from(new Set([...prev, ...d.documents])));
        }
      }).catch(() => {});
      api.health().catch(() => {});
    });
  }, []);

  const handleLocate = useCallback((annotation: Annotation) => {
    setAnnotations([annotation]);
    setTargetPage(annotation.page ?? 1);
    setMobileTab('document');
  }, []);

  const handleMapQuery = useCallback((query: string) => {
    setNetworkQuery(query);
    setShowNetwork(true);
  }, []);

  const handleAuditComplete = useCallback((result: AuditResult) => {
    setAuditResult(result);
    setAnnotations(result.annotations || []);
    setIsAuditing(false);
    setMobileTab('analysis');
  }, []);

  const handleAuditStart = useCallback(() => {
    setAuditResult(null);
    setAnnotations([]);
    setIsAuditing(true);
    setMobileTab('analysis');
  }, []);

  const documentPane = (
    <RightPane
      selectedDoc={selectedDoc}
      annotations={annotations}
      targetPage={targetPage}
    />
  );

  const analysisPane = (
    <LeftPane
      documents={documents}
      setDocuments={setDocuments}
      selectedDoc={selectedDoc}
      onSelectDoc={setSelectedDoc}
      auditResult={auditResult}
      isAuditRunning={isAuditing}
      onAuditStart={handleAuditStart}
      onAuditComplete={handleAuditComplete}
      onLocate={handleLocate}
      onCommitChange={setIsCommitted}
    />
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F9FAFB]">
      <div className="border-b border-[var(--border-default)] bg-white px-4 py-3">
        <div className="enterprise-container">
          <BackNavigation breadcrumbs={[{ label: 'Dashboard' }, { label: 'Audit' }]} useBackButton />
        </div>
      </div>
      <Header
        isAuditing={isAuditing}
        onToggleNetwork={() => {
          setShowNetwork(!showNetwork);
          setNetworkQuery(undefined);
        }}
        documents={documents}
        onSelectDoc={setSelectedDoc}
      />

      <div className="hidden min-h-0 flex-1 lg:flex">
        <section className="flex min-w-0 flex-1 flex-col border-r border-[var(--border-default)] bg-[#F9FAFB]">
          {documentPane}
        </section>
        <aside className="flex w-[440px] min-w-[380px] flex-col bg-white xl:w-[480px]">
          {analysisPane}
        </aside>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="grid grid-cols-2 gap-2 border-b border-[var(--border-default)] bg-white p-2">
          <button
            onClick={() => setMobileTab('document')}
            className={`flex items-center justify-center gap-2 border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition hover:-translate-y-0.5 ${
              mobileTab === 'document'
                ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <FileText className="h-4 w-4" />
            Document
          </button>
          <button
            onClick={() => setMobileTab('analysis')}
            className={`flex items-center justify-center gap-2 border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition hover:-translate-y-0.5 ${
              mobileTab === 'analysis'
                ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <ListChecks className="h-4 w-4" />
            Analysis
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {mobileTab === 'document' ? documentPane : analysisPane}
        </div>
      </div>

      {showNetwork && selectedDoc && (
        <NetworkPanel
          selectedDoc={selectedDoc}
          onClose={() => {
            setShowNetwork(false);
            setNetworkQuery(undefined);
          }}
          isCommitted={isCommitted}
          query={networkQuery}
        />
      )}

      {selectedDoc && (
        <ChatOverlay
          selectedDoc={selectedDoc}
          onLocate={handleLocate}
          onMapQuery={handleMapQuery}
        />
      )}

      <Suspense fallback={null}>
        <PaymentListener />
      </Suspense>
    </div>
  );
}
