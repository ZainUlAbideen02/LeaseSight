'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, ServerCog, XCircle, Cpu, Key, Save, Trash2, ShieldAlert } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { BackNavigation } from '@/components/BackNavigation';
import { api } from '@/lib/api';
import { getUserGroqKey, setUserGroqKey, removeUserGroqKey, hasUserGroqKey } from '@/lib/userKeyStore';

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

export default function SettingsPage() {
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');

  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [isGroqKeyActive, setIsGroqKeyActive] = useState(false);
  const [keyMask, setKeyMask] = useState('');
  const [keyNotice, setKeyNotice] = useState<string | null>(null);

  useEffect(() => {
    refreshKey();
  }, []);

  const refreshKey = () => {
    const active = hasUserGroqKey();
    const key = getUserGroqKey();
    setIsGroqKeyActive(active);
    if (key && key.length > 8) {
      setKeyMask(`${key.slice(0, 4)}...${key.slice(-4)}`);
      setGroqKeyInput(key);
    } else {
      setKeyMask('');
      setGroqKeyInput('');
    }
  };

  const handleSaveGroqKey = () => {
    const trimmed = groqKeyInput.trim();
    if (!trimmed) {
      handleClearGroqKey();
      return;
    }
    setUserGroqKey(trimmed);
    refreshKey();
    setKeyNotice('Custom Groq API Key saved for in-browser RAG & LLM audit reasoning.');
    setTimeout(() => setKeyNotice(null), 3500);
  };

  const handleClearGroqKey = () => {
    removeUserGroqKey();
    refreshKey();
    setKeyNotice('Key cleared. In-browser client engine reverted to Fallback Mode.');
    setTimeout(() => setKeyNotice(null), 3500);
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const res = await api.testConnection();
      const success = res.success || res.status === 'success';
      setTestStatus(success ? 'ok' : 'error');
      setTestMessage(success ? 'Server Gemini, Azure, Pinecone, and local embedding configuration is reachable.' : res.message || 'Connection failed.');
    } catch (e) {
      setTestStatus('error');
      setTestMessage(e instanceof Error ? e.message : 'Connection failed.');
    }
  };

  return (
    <main className="min-h-screen bg-[#F9FAFB] text-[#1A1A1A]">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="enterprise-container flex h-16 items-center justify-between">
          <BrandLogo />
          <BackNavigation breadcrumbs={[{ label: 'Dashboard', href: '/dashboard/audit' }]} />
        </div>
      </header>

      <section className="enterprise-container py-12">
        <div className="mx-auto max-w-2xl space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">System Settings</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Configuration & API Keys</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Manage your client-side browser RAG configuration and backend API connectivity.
            </p>
          </div>

          {/* Client-Side Browser RAG Engine & Groq API Key */}
          <div className="border border-slate-200 bg-white p-6 shadow-sm rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="border border-purple-200 bg-purple-50 p-3 rounded-xl text-purple-600">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-base">In-Browser RAG & LLM Engine</h2>
                <p className="text-xs text-slate-500">WebGPU/WASM vector embeddings & local Groq LPU reasoning.</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border p-4 flex items-center justify-between"
                 style={{
                   backgroundColor: isGroqKeyActive ? '#F0FDF4' : '#FFFBEB',
                   borderColor: isGroqKeyActive ? '#BBF7D0' : '#FDE68A',
                 }}>
              <div className="flex items-center gap-3">
                {isGroqKeyActive ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
                )}
                <div>
                  <p className={`text-xs font-bold ${isGroqKeyActive ? 'text-emerald-900' : 'text-amber-900'}`}>
                    {isGroqKeyActive ? `Custom Key Active (${keyMask})` : 'Fallback Mode (No API Key)'}
                  </p>
                  <p className={`text-xs ${isGroqKeyActive ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {isGroqKeyActive
                      ? 'Groq LPU LLM audit reasoning active (llama-3.3-70b)'
                      : 'Deterministic client-side regex audit parser active'}
                  </p>
                </div>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                isGroqKeyActive ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
              }`}>
                {isGroqKeyActive ? 'ACTIVE' : 'FALLBACK'}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Groq API Key (<code className="text-purple-600">gsk_...</code>)
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  value={groqKeyInput}
                  onChange={(e) => setGroqKeyInput(e.target.value)}
                  placeholder="gsk_your_groq_api_key..."
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Key is saved exclusively in your browser's <code className="bg-slate-100 px-1 py-0.5 rounded">localStorage</code> (`user_groq_key`).
              </p>
            </div>

            {keyNotice && (
              <div className="mt-3 rounded-xl bg-slate-900 p-3 text-xs text-white animate-fade-in">
                {keyNotice}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              {isGroqKeyActive && (
                <button
                  onClick={handleClearGroqKey}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors mr-auto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear Key
                </button>
              )}
              <button
                onClick={handleSaveGroqKey}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-purple-700 transition-all hover:shadow-lg"
              >
                <Save className="h-3.5 w-3.5" />
                Save API Key
              </button>
            </div>
          </div>

          {/* Managed Backend Diagnostics */}
          <div className="border border-slate-200 bg-white p-6 shadow-sm rounded-2xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="border border-slate-200 p-3 rounded-xl">
                  <ServerCog className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-base">Managed Backend Diagnostics</h2>
                  <p className="text-xs text-slate-500">Runs server health checks and local embedding warmup.</p>
                </div>
              </div>
            </div>

            {testStatus !== 'idle' && (
              <div className={`mt-4 flex items-center gap-2 border p-3 rounded-xl text-sm ${
                testStatus === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
                testStatus === 'error' ? 'border-red-200 bg-red-50 text-red-700' :
                'border-slate-200 bg-slate-50 text-slate-600'
              }`}>
                {testStatus === 'testing' && <Loader2 className="h-4 w-4 animate-spin" />}
                {testStatus === 'ok' && <CheckCircle2 className="h-4 w-4" />}
                {testStatus === 'error' && <XCircle className="h-4 w-4" />}
                {testStatus === 'testing' ? 'Testing managed backend...' : testMessage}
              </div>
            )}

            <button onClick={handleTest} disabled={testStatus === 'testing'} className="mt-6 border border-slate-300 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] transition hover:-translate-y-0.5 hover:border-[#1A1A1A] disabled:opacity-40 rounded-xl">
              Test Managed Backend
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
